import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";
import {
  configurarPausa,
  ejecutarMiembrosDeudores,
  ejecutarRecordatorioPago,
  ejecutarYRegistrar,
  fechasRecordatorio,
  iniciarPresupuesto,
} from "@/lib/features/notificaciones/ejecucion";
import { pagosService } from "@/lib/features/pagos/service";
import {
  sendPaymentDebtEmail,
  sendPaymentReminderEmail,
  sendAdminReminderEmail,
  sendErrorReportEmail,
} from "@/lib/services/email/email.service";
import type { Moroso } from "@/lib/features/pagos/domain/types";

vi.mock("@/lib/services/email/email.service", () => ({
  sendPaymentDebtEmail: vi.fn(),
  sendPaymentReminderEmail: vi.fn(),
  sendAdminReminderEmail: vi.fn(),
  sendErrorReportEmail: vi.fn(),
}));

vi.mock("@/lib/features/pagos/service", () => ({
  pagosService: { getMiembrosMorosos: vi.fn().mockResolvedValue([]) },
}));

const GYM = {
  gym_name: "Mi Gym",
  logo_url: null,
  owner_email: null,
  address: null,
  billing_mode: "dia_uno",
};

function moroso(overrides: Partial<Moroso> = {}): Moroso {
  return {
    id: "u1",
    email: "socio@test.com",
    full_name: "Socio Uno",
    deudas: [{ month_number: 1, year_number: 2026, payment_amount: 30 }],
    totalDeuda: 30,
    debeInscripcion: false,
    mesesDeuda: [1],
    pagosPendientes: 1,
    montoPendiente: 30,
    ...overrides,
  };
}

describe("fechasRecordatorio", () => {
  it("dia_uno: con cobro el 1, el aviso cae en el mes anterior", () => {
    const fechas = fechasRecordatorio("2026-05-10", 3, "dia_uno", new Date(2026, 4, 25));
    expect(fechas.cobro).toEqual(new Date(2026, 5, 1));
    expect(fechas.notificacion).toEqual(new Date(2026, 4, 29));
  });

  it("dia_uno: si hoy es el día de cobro, el cobro es hoy", () => {
    const fechas = fechasRecordatorio("2026-05-10", 3, "dia_uno", new Date(2026, 4, 1));
    expect(fechas.cobro).toEqual(new Date(2026, 4, 1));
    expect(fechas.notificacion).toEqual(new Date(2026, 3, 28));
  });

  it("fecha_inscripcion: usa el día de inscripción cuando aún no venció", () => {
    const fechas = fechasRecordatorio("2026-01-15", 3, "fecha_inscripcion", new Date(2026, 0, 5));
    expect(fechas.cobro).toEqual(new Date(2026, 0, 15));
    expect(fechas.notificacion).toEqual(new Date(2026, 0, 12));
  });

  it("fecha_inscripcion: ajusta el día 31 a los meses cortos", () => {
    const fechas = fechasRecordatorio("2026-01-31", 0, "fecha_inscripcion", new Date(2026, 1, 10));
    expect(fechas.cobro).toEqual(new Date(2026, 1, 28));
    expect(fechas.notificacion).toEqual(new Date(2026, 1, 28));
  });
});

describe("ejecutarRecordatorioPago", () => {
  let fake: SupabaseFake;

  const config = { id: "cfg-recordatorio", notification_type: "recordatorio_pago", days_before: 30 };

  function encolar(
    ultimoLog: unknown,
    detalles: unknown[] = [],
    cabeceras: unknown[] = []
  ) {
    fake.on("notification_log", "select").reply(ultimoLog as Record<string, unknown>);
    fake.on("profiles", "select").reply({
      data: [
        { id: "u1", email: "socio@test.com", full_name: "Socio Uno", start_date: "2026-01-15" },
      ],
    });
    fake.on("memberships", "select").reply({ data: [] });
    fake.on("payment_detail", "select").reply({ data: detalles });
    if (detalles.length > 0) {
      fake.on("payments", "select").reply({ data: cabeceras });
    }
  }

  beforeEach(() => {
    configurarPausa(0);
    fake = createSupabaseFake();
    vi.mocked(sendPaymentReminderEmail).mockReset();
    vi.mocked(sendAdminReminderEmail).mockReset();
  });

  afterEach(() => {
    iniciarPresupuesto();
  });

  it("envía cuando la ventana está abierta y no había aviso previo", async () => {
    encolar({ data: null });

    const resultado = await ejecutarRecordatorioPago(fake.client, config, GYM);

    expect(resultado).toEqual({ enviados: 1, fallos: 0 });
    expect(sendPaymentReminderEmail).toHaveBeenCalledTimes(1);
    expect(sendPaymentReminderEmail).toHaveBeenCalledWith(
      "socio@test.com",
      "Socio Uno",
      "Mi Gym",
      expect.any(Number),
      expect.any(String),
      null,
      null
    );
  });

  it("no repite el aviso dentro del mismo ciclo", async () => {
    encolar({ data: { sent_at: new Date().toISOString() } });

    const resultado = await ejecutarRecordatorioPago(fake.client, config, GYM);

    expect(resultado).toEqual({ enviados: 0, fallos: 0 });
    expect(sendPaymentReminderEmail).not.toHaveBeenCalled();
    expect(sendAdminReminderEmail).not.toHaveBeenCalled();
  });

  it("forzar salta la ventana y el dedup", async () => {
    encolar({ data: { sent_at: new Date().toISOString() } });
    const configCorta = { ...config, days_before: 0 };

    const resultado = await ejecutarRecordatorioPago(fake.client, configCorta, GYM, true);

    expect(resultado).toEqual({ enviados: 1, fallos: 0 });
    expect(sendPaymentReminderEmail).toHaveBeenCalledTimes(1);
  });

  it("excluye a los socios que ya pagaron el mes", async () => {
    encolar(
      { data: null },
      [{ payment_id: "p1", payment_amount: 30 }],
      [{ id: "p1", user_id: "u1", status: "aprobado" }]
    );

    const resultado = await ejecutarRecordatorioPago(fake.client, config, GYM);

    expect(resultado).toEqual({ enviados: 0, fallos: 0 });
    expect(sendPaymentReminderEmail).not.toHaveBeenCalled();
  });
});

describe("ejecutarMiembrosDeudores", () => {
  let fake: SupabaseFake;

  beforeEach(() => {
    configurarPausa(0);
    fake = createSupabaseFake();
    vi.mocked(sendPaymentDebtEmail).mockReset();
    vi.mocked(pagosService.getMiembrosMorosos).mockReset();
  });

  afterEach(() => {
    iniciarPresupuesto();
  });

  it("suma fallos sin dejar de intentar el resto", async () => {
    vi.mocked(pagosService.getMiembrosMorosos).mockResolvedValue([
      moroso(),
      moroso({ id: "u2", email: "otro@test.com", full_name: "Socio Dos" }),
    ]);
    vi.mocked(sendPaymentDebtEmail)
      .mockRejectedValueOnce(new Error("SMTP down"))
      .mockResolvedValueOnce(undefined);

    const resultado = await ejecutarMiembrosDeudores(fake.client, GYM);

    expect(resultado).toEqual({ enviados: 1, fallos: 1 });
    expect(sendPaymentDebtEmail).toHaveBeenCalledTimes(2);
  });

  it("corta el lote cuando se agota el presupuesto de tiempo", async () => {
    vi.mocked(pagosService.getMiembrosMorosos).mockResolvedValue([moroso()]);
    iniciarPresupuesto(0);

    const resultado = await ejecutarMiembrosDeudores(fake.client, GYM);

    expect(resultado).toEqual({ enviados: 0, fallos: 0 });
    expect(sendPaymentDebtEmail).not.toHaveBeenCalled();
  });
});

describe("ejecutarYRegistrar", () => {
  let fake: SupabaseFake;
  const config = { id: "cfg-deuda", notification_type: "miembros_deudores" };

  beforeEach(() => {
    configurarPausa(0);
    fake = createSupabaseFake();
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAIL", "admin@test.com");
    vi.mocked(sendPaymentDebtEmail).mockReset();
    vi.mocked(sendErrorReportEmail).mockReset();
    vi.mocked(pagosService.getMiembrosMorosos).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    iniciarPresupuesto();
  });

  it("sin destinatarios no escribe log (no consume la ventana de frecuencia)", async () => {
    vi.mocked(pagosService.getMiembrosMorosos).mockResolvedValue([]);

    const resultado = await ejecutarYRegistrar(fake.client, config, GYM, { origen: "cron" });

    expect(resultado).toEqual({ enviados: 0, sinProblemas: true });
    expect(fake.callsTo("notification_log", "insert")).toHaveLength(0);
    expect(sendErrorReportEmail).not.toHaveBeenCalled();
  });

  it("envío completo escribe log de éxito", async () => {
    vi.mocked(pagosService.getMiembrosMorosos).mockResolvedValue([moroso()]);
    vi.mocked(sendPaymentDebtEmail).mockResolvedValue(undefined);

    const resultado = await ejecutarYRegistrar(fake.client, config, GYM, {
      origen: "cron",
      userId: "user-1",
    });

    expect(resultado).toEqual({ enviados: 1, sinProblemas: true });

    const inserts = fake.callsTo("notification_log", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({
      notification_config_id: "cfg-deuda",
      members_notified: 1,
      no_issues: true,
      created_by: "user-1",
    });
  });

  it("fallo de envío marca el log como error y avisa al admin", async () => {
    vi.mocked(pagosService.getMiembrosMorosos).mockResolvedValue([moroso()]);
    vi.mocked(sendPaymentDebtEmail).mockRejectedValue(new Error("SMTP down"));

    const resultado = await ejecutarYRegistrar(fake.client, config, GYM, { origen: "cron" });

    expect(resultado).toEqual({ enviados: 0, sinProblemas: false });

    const inserts = fake.callsTo("notification_log", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({ no_issues: false, members_notified: 0 });
    expect(String((inserts[0].payload as { error_detail?: string }).error_detail)).toContain(
      "Fallo parcial"
    );
    expect(sendErrorReportEmail).toHaveBeenCalledTimes(1);
  });

  it("excepción del procesador queda registrada con el origen", async () => {
    vi.mocked(pagosService.getMiembrosMorosos).mockRejectedValue(new Error("RPC caído"));

    const resultado = await ejecutarYRegistrar(fake.client, config, GYM, { origen: "manual" });

    expect(resultado.sinProblemas).toBe(false);
    const inserts = fake.callsTo("notification_log", "insert");
    expect(inserts).toHaveLength(1);
    expect(String((inserts[0].payload as { error_detail?: string }).error_detail)).toContain(
      "RPC caído"
    );

    const llamada = vi.mocked(sendErrorReportEmail).mock.calls[0];
    expect(String(llamada[2].paso)).toContain("Notificación manual:");
  });

  it("resumen sin correo de dueño falla en vez de pasar en silencio", async () => {
    const configResumen = { id: "cfg-resumen", notification_type: "resumen_dueno" };

    const resultado = await ejecutarYRegistrar(fake.client, configResumen, GYM, {
      origen: "cron",
    });

    expect(resultado).toEqual({ enviados: 0, sinProblemas: false });
    const inserts = fake.callsTo("notification_log", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({ no_issues: false });
  });
});
