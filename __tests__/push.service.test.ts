import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendNotification, setVapidDetails, WebPushError } from "web-push";
import {
  pushConfigurado,
  pushHabilitado,
  enviarPushAUsuarios,
  enviarPushAAdmins,
} from "@/lib/features/push/service";
import type { PayloadPush } from "@/lib/features/push/types";
import { createSupabaseFake } from "./helpers/supabase-fake";

vi.mock("web-push", () => {
  class WebPushErrorMock extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return {
    sendNotification: vi.fn(),
    setVapidDetails: vi.fn(),
    WebPushError: WebPushErrorMock,
  };
});

const sendMock = vi.mocked(sendNotification);
const payload: PayloadPush = { title: "Título", body: "Cuerpo", url: "/dashboard" };

const CLAVES_OK = { NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: "pub-test", WEB_PUSH_PRIVATE_KEY: "priv-test" };

function conClaves() {
  vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY", CLAVES_OK.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY);
  vi.stubEnv("WEB_PUSH_PRIVATE_KEY", CLAVES_OK.WEB_PUSH_PRIVATE_KEY);
}

function sinClaves() {
  vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY", "");
  vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "");
}

const FILA_SUB = {
  id: "sub-1",
  endpoint: "https://push.example.com/abc",
  p256dh: "p256dh-valor",
  auth: "auth-valor",
};

describe("pushConfigurado", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it("true cuando ambas claves VAPID están definidas", () => {
    conClaves();
    expect(pushConfigurado()).toBe(true);
  });

  it("false cuando faltan claves", () => {
    sinClaves();
    expect(pushConfigurado()).toBe(false);
  });
});

describe("pushHabilitado", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lee gym_config.push_enabled", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: true } });
    await expect(pushHabilitado(fake.client)).resolves.toBe(true);
  });

  it("push_enabled false → apagado", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: false } });
    await expect(pushHabilitado(fake.client)).resolves.toBe(false);
  });

  it("error de lectura (migración pendiente) → apagado, sin lanzar", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ error: { message: "column gym_config.push_enabled does not exist" } });
    await expect(pushHabilitado(fake.client)).resolves.toBe(false);
  });
});

describe("enviarPushAUsuarios", () => {
  beforeEach(() => {
    conClaves();
    sendMock.mockReset();
    vi.mocked(setVapidDetails).mockReset();
    sendMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("sin claves VAPID → omitido sin_configurar y sin consultas", async () => {
    sinClaves();
    const fake = createSupabaseFake();
    const res = await enviarPushAUsuarios(fake.client, ["u1"], payload);
    expect(res).toEqual({ enviados: 0, fallos: 0, omitido: "sin_configurar" });
    expect(fake.callsTo("gym_config").length).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("push_enabled=false → omitido deshabilitado y sin consultar suscripciones", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: false } });
    const res = await enviarPushAUsuarios(fake.client, ["u1"], payload);
    expect(res).toEqual({ enviados: 0, fallos: 0, omitido: "deshabilitado" });
    expect(fake.callsTo("push_subscriptions", "select").length).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("lista vacía → vacío sin omitido y sin consultas", async () => {
    const fake = createSupabaseFake();
    const res = await enviarPushAUsuarios(fake.client, [], payload);
    expect(res).toEqual({ enviados: 0, fallos: 0, omitido: null });
    expect(fake.callsTo("gym_config").length).toBe(0);
  });

  it("envía a cada suscripción con las claves VAPID configuradas", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: true } });
    fake.on("push_subscriptions", "select").reply({
      data: [FILA_SUB, { ...FILA_SUB, id: "sub-2", endpoint: "https://push.example.com/def" }],
    });
    const res = await enviarPushAUsuarios(fake.client, ["u1", "u2"], payload);
    expect(res).toEqual({ enviados: 2, fallos: 0, omitido: null });
    expect(vi.mocked(setVapidDetails)).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock).toHaveBeenCalledWith(
      { endpoint: FILA_SUB.endpoint, keys: { p256dh: FILA_SUB.p256dh, auth: FILA_SUB.auth } },
      JSON.stringify(payload)
    );
    const select = fake.callsTo("push_subscriptions", "select")[0];
    expect(select.filters).toContainEqual(["in", "user_id", ["u1", "u2"]]);
  });

  it("410 (suscripción caduca) → fallo y se limpia la fila", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: true } });
    fake.on("push_subscriptions", "select").reply({ data: [FILA_SUB] });
    sendMock.mockRejectedValue(new WebPushError("gone", 410));
    const res = await enviarPushAUsuarios(fake.client, ["u1"], payload);
    expect(res).toEqual({ enviados: 0, fallos: 1, omitido: null });
    const deletes = fake.callsTo("push_subscriptions", "delete");
    expect(deletes.length).toBe(1);
    expect(deletes[0].filters).toContainEqual(["eq", "id", FILA_SUB.id]);
  });

  it("error de red genérico → fallo sin lanzar y sin borrar filas", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: true } });
    fake.on("push_subscriptions", "select").reply({ data: [FILA_SUB] });
    sendMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(enviarPushAUsuarios(fake.client, ["u1"], payload)).resolves.toEqual({
      enviados: 0,
      fallos: 1,
      omitido: null,
    });
    expect(fake.callsTo("push_subscriptions", "delete").length).toBe(0);
  });
});

describe("enviarPushAAdmins", () => {
  beforeEach(() => {
    conClaves();
    sendMock.mockReset();
    vi.mocked(setVapidDetails).mockReset();
    sendMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("push_enabled=false → omitido sin resolver perfiles", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: false } });
    const res = await enviarPushAAdmins(fake.client, payload);
    expect(res).toEqual({ enviados: 0, fallos: 0, omitido: "deshabilitado" });
    expect(fake.callsTo("profiles").length).toBe(0);
  });

  it("resuelve super_admin activos y envía a sus suscripciones", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: true } });
    fake.on("profiles", "select").reply({ data: [{ id: "admin-1" }, { id: "admin-2" }] });
    fake.on("push_subscriptions", "select").reply({ data: [FILA_SUB] });

    const res = await enviarPushAAdmins(fake.client, payload);
    expect(res).toEqual({ enviados: 1, fallos: 0, omitido: null });

    const perfiles = fake.callsTo("profiles", "select")[0];
    expect(perfiles.filters).toContainEqual(["eq", "role", "super_admin"]);
    expect(perfiles.filters).toContainEqual(["not", "activo", "is", false]);
    const subs = fake.callsTo("push_subscriptions", "select")[0];
    expect(subs.filters).toContainEqual(["in", "user_id", ["admin-1", "admin-2"]]);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("sin suscripciones entre los admins → vacío sin omitido", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: true } });
    fake.on("profiles", "select").reply({ data: [{ id: "admin-1" }] });
    fake.on("push_subscriptions", "select").reply({ data: [] });
    const res = await enviarPushAAdmins(fake.client, payload);
    expect(res).toEqual({ enviados: 0, fallos: 0, omitido: null });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("con excluir → no envía al admin que ejecutó la acción", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: true } });
    fake.on("profiles", "select").reply({ data: [{ id: "admin-1" }, { id: "admin-2" }] });
    fake.on("push_subscriptions", "select").reply({ data: [FILA_SUB] });

    const res = await enviarPushAAdmins(fake.client, payload, { excluir: "admin-1" });
    expect(res).toEqual({ enviados: 1, fallos: 0, omitido: null });
    const subs = fake.callsTo("push_subscriptions", "select")[0];
    expect(subs.filters).toContainEqual(["in", "user_id", ["admin-2"]]);
  });

  it("con excluir y sin otros admins → vacío (no resuelve suscripciones)", async () => {
    const fake = createSupabaseFake();
    fake.on("gym_config", "select").reply({ data: { push_enabled: true } });
    fake.on("profiles", "select").reply({ data: [{ id: "admin-1" }] });
    const res = await enviarPushAAdmins(fake.client, payload, { excluir: "admin-1" });
    expect(res).toEqual({ enviados: 0, fallos: 0, omitido: null });
    expect(fake.callsTo("push_subscriptions", "select").length).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
