import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";
import { TasasService } from "@/lib/features/tasas/service";
import { FUENTE_TASA } from "@/lib/features/tasas/proveedores/dolarapi";
import { messages } from "@/lib/messages";

let fake: SupabaseFake;
let service: TasasService;
const fetchMock = vi.fn();

const PROVEEDOR_OK = {
  ok: true,
  json: async () => ({ promedio: 897.5383, fechaActualizacion: "2026-11-09T00:00:00-04:00" }),
};

function haceHoras(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function haceDias(d: number): string {
  return new Date(Date.now() - d * 24 * 3600_000).toISOString();
}

beforeEach(() => {
  fake = createSupabaseFake();
  service = new TasasService(fake.client);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("obtenerTasas", () => {
  it("devuelve las filas que trae la BD", async () => {
    fake.on("exchange_rates", "select").reply({
      data: [{ id: 3, effective_at: "2026-11-09T04:00:00.000Z", rate_bs: 897.5383 }],
    });
    const tasas = await service.obtenerTasas();
    expect(tasas).toHaveLength(1);
    expect(tasas[0].rate_bs).toBe(897.5383);
  });

  it("devuelve [] sin registro", async () => {
    await expect(service.obtenerTasas()).resolves.toEqual([]);
  });
});

describe("actualizar", () => {
  it("sin registro previo: consulta, inserta y poda", async () => {
    fake.on("exchange_rates", "select").reply({ data: null }); // ultimaTasa
    fetchMock.mockResolvedValue(PROVEEDOR_OK);
    fake.on("exchange_rates", "select").reply({ data: null }); // existe
    fake.on("exchange_rates", "select").reply({ data: [{ id: 1 }] }); // podar
    fake.on("exchange_rates", "select").reply({
      data: [{ id: 1, effective_at: "2026-11-09T04:00:00.000Z", rate_bs: 897.5383 }],
    }); // obtenerTasas final

    const r = await service.actualizar();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(FUENTE_TASA.endpoint);

    const inserts = fake.callsTo("exchange_rates", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toEqual({
      effective_at: "2026-11-09T04:00:00.000Z",
      rate_bs: 897.5383,
      source: "dolarapi",
    });

    expect(r.actualizado).toBe(true);
    expect(r.tasas).toHaveLength(1);
    expect(fake.callsTo("exchange_rates", "delete")).toHaveLength(0);
  });

  it("vigencia fresca (< 6 h): no toca al proveedor", async () => {
    fake.on("exchange_rates", "select").reply({
      data: { id: 1, effective_at: haceHoras(1), rate_bs: 900, created_at: haceHoras(1) },
    });
    fake.on("exchange_rates", "select").reply({ data: [] });

    const r = await service.actualizar();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.actualizado).toBe(false);
    expect(r.motivo).toBe("vigente");
    expect(fake.callsTo("exchange_rates", "insert")).toHaveLength(0);
  });

  it("escrita hace menos de 10 min (aunque la vigencia este vieja): no consulta", async () => {
    fake.on("exchange_rates", "select").reply({
      data: { id: 1, effective_at: haceDias(7), rate_bs: 900, created_at: new Date(Date.now() - 60_000).toISOString() },
    });
    fake.on("exchange_rates", "select").reply({ data: [] });

    const r = await service.actualizar();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.motivo).toBe("reciente");
    expect(fake.callsTo("exchange_rates", "insert")).toHaveLength(0);
  });

  it("forzar: consulta aunque la vigencia este fresca", async () => {
    fake.on("exchange_rates", "select").reply({
      data: { id: 1, effective_at: haceHoras(1), rate_bs: 900, created_at: haceHoras(1) },
    });
    fetchMock.mockResolvedValue(PROVEEDOR_OK);
    fake.on("exchange_rates", "select").reply({ data: { id: 1 } }); // ya existe ese par
    fake.on("exchange_rates", "select").reply({ data: [] });

    const r = await service.actualizar({ forzar: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.actualizado).toBe(false);
    expect(r.motivo).toBe("duplicado");
    expect(fake.callsTo("exchange_rates", "insert")).toHaveLength(0);
  });

  it("proveedor caido: fail-open sin insertar", async () => {
    fake.on("exchange_rates", "select").reply({ data: null });
    fetchMock.mockRejectedValue(new Error("timeout"));
    fake.on("exchange_rates", "select").reply({ data: [{ id: 1, effective_at: haceDias(3), rate_bs: 900 }] });

    const r = await service.actualizar();

    expect(r.actualizado).toBe(false);
    expect(r.motivo).toBe("error");
    expect(r.error).toBe(messages.tasas.errorProveedor);
    expect(r.tasas).toHaveLength(1);
    expect(fake.callsTo("exchange_rates", "insert")).toHaveLength(0);
  });

  it("payload invalido del proveedor: no inserta", async () => {
    fake.on("exchange_rates", "select").reply({ data: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ promedio: 0, fechaActualizacion: "2026-11-09" }) });
    fake.on("exchange_rates", "select").reply({ data: [] });

    const r = await service.actualizar();

    expect(r.actualizado).toBe(false);
    expect(r.motivo).toBe("error");
    expect(fake.callsTo("exchange_rates", "insert")).toHaveLength(0);
  });

  it("par (vigencia, monto) ya registrado: no duplica", async () => {
    fake.on("exchange_rates", "select").reply({
      data: { id: 7, effective_at: haceDias(2), rate_bs: 850, created_at: haceDias(2) },
    });
    fetchMock.mockResolvedValue(PROVEEDOR_OK);
    fake.on("exchange_rates", "select").reply({ data: { id: 7 } }); // existe
    fake.on("exchange_rates", "select").reply({ data: [] });

    const r = await service.actualizar({ forzar: true });

    expect(r.actualizado).toBe(false);
    expect(r.motivo).toBe("duplicado");
    expect(fake.callsTo("exchange_rates", "insert")).toHaveLength(0);
  });

  it("al insertar poda dejando solo las 10 mas recientes", async () => {
    fake.on("exchange_rates", "select").reply({ data: null });
    fetchMock.mockResolvedValue(PROVEEDOR_OK);
    fake.on("exchange_rates", "select").reply({ data: null }); // existe
    // podar: 12 filas ya ordenadas desc (12 = mas reciente)
    const doce = Array.from({ length: 12 }, (_, i) => ({ id: 12 - i }));
    fake.on("exchange_rates", "select").reply({ data: doce });
    fake.on("exchange_rates", "select").reply({ data: [] });

    const r = await service.actualizar();

    expect(r.actualizado).toBe(true);
    const deletes = fake.callsTo("exchange_rates", "delete");
    expect(deletes).toHaveLength(1);
    const inFilter = deletes[0].filters.find((f) => f[0] === "in");
    expect(inFilter).toEqual(["in", "id", [2, 1]]);
  });

  it("sin registro + sin respuesta util del proveedor devuelve error sin lanzar", async () => {
    fake.on("exchange_rates", "select").reply({ data: null });
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    fake.on("exchange_rates", "select").reply({ data: [] });

    const r = await service.actualizar();

    expect(r.actualizado).toBe(false);
    expect(r.motivo).toBe("error");
    expect(r.tasas).toEqual([]);
    expect(fake.callsTo("exchange_rates", "insert")).toHaveLength(0);
  });
});
