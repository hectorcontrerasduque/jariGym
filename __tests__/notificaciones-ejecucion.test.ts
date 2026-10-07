import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";
import {
  LIMITE_BITACORA,
  configurarPausa,
  ejecutarCorrida,
  ejecutarMiembrosDeudores,
  ejecutarRecordatorioPago,
  fechasRecordatorio,
  iniciarPresupuesto,
} from "@/lib/features/notificaciones/ejecucion";
import { pagosService } from "@/lib/features/pagos/service";
import { messages } from "@/lib/messages";
import {
  sendPaymentDebtEmail,
  sendPaymentReminderEmail,
  sendAdminReminderEmail,
  sendRunReportEmail,
} from "@/lib/services/email/email.service";
import type { Moroso } from "@/lib/features/pagos/domain/types";

vi.mock("@/lib/services/email/email.service", () => ({
  sendPaymentDebtEmail: vi.fn(),
  sendPaymentReminderEmail: vi.fn(),
  sendAdminReminderEmail: vi.fn(),
  sendRunReportEmail: vi.fn(),
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
  // Con la ventana eliminada el llamador usa lead 0: notificacion === cobro.
  it("dia_uno: cobro el 1 del próximo mes cuando hoy aún no llegó", () => {
    const fechas = fechasRecordatorio("2026-05-10", 0, "dia_uno", new Date(2026, 4, 25));
    expect(fechas.cobro).toEqual(new Date(2026, 5, 1));
    expect(fechas.notificacion).toEqual(new Date(2026, 5, 1));
  });

  it("dia_uno: si hoy es el día de cobro, el cobro es hoy", () => {
    const fechas = fechasRecordatorio("2026-05-10", 0, "dia_uno", new Date(2026, 4, 1));
    expect(fechas.cobro).toEqual(new Date(2026, 4, 1));
    expect(fechas.notificacion).toEqual(new Date(2026, 4, 1));
  });

  it("fecha_inscripcion: usa el día de inscripción cuando aún no venció", () => {
    const fechas = fechasRecordatorio("2026-01-15", 0, "fecha_inscripcion", new Date(2026, 0, 5));
    expect(fechas.cobro).toEqual(new Date(2026, 0, 15));
    expect(fechas.notificacion).toEqual(new Date(2026, 0, 15));
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

  it("envía a todos los candidatos cuando no había aviso previo", async () => {
    encolar({ data: null });

    const resultado = await ejecutarRecordatorioPago(fake.client, config, GYM);

    expect(resultado).toMatchObject({ enviados: 1, fallos: 0 });
    expect(resultado.enviadosA).toEqual(["socio@test.com"]);
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

  it("no repite el aviso el mismo día (VET)", async () => {
    encolar({ data: { sent_at: new Date().toISOString() } });

    const resultado = await ejecutarRecordatorioPago(fake.client, config, GYM);

    expect(resultado).toMatchObject({ enviados: 0, fallos: 0 });
    expect(sendPaymentReminderEmail).not.toHaveBeenCalled();
    expect(sendAdminReminderEmail).not.toHaveBeenCalled();
    expect(fake.callsTo("profiles", "select")).toHaveLength(0);
  });

  it("vuelve a enviar si el último aviso fue ayer (ya no hay ventana por socio)", async () => {
    encolar({ data: { sent_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString() } });

    const resultado = await ejecutarRecordatorioPago(fake.client, config, GYM);

    expect(resultado).toMatchObject({ enviados: 1, fallos: 0 });
    expect(sendPaymentReminderEmail).toHaveBeenCalledTimes(1);
  });

  it("forzar salta el dedup del día y no consulta la bitácora", async () => {
    encolar({ data: { sent_at: new Date().toISOString() } });

    const resultado = await ejecutarRecordatorioPago(fake.client, config, GYM, true);

    expect(resultado).toMatchObject({ enviados: 1, fallos: 0 });
    expect(sendPaymentReminderEmail).toHaveBeenCalledTimes(1);
    expect(fake.callsTo("notification_log", "select")).toHaveLength(0);
  });

  it("excluye a los que ya pagaron el próximo mes y consulta ese mes", async () => {
    encolar(
      { data: null },
      [{ payment_id: "p1", payment_amount: 30 }],
      [{ id: "p1", user_id: "u1", status: "aprobado" }]
    );

    const resultado = await ejecutarRecordatorioPago(fake.client, config, GYM);

    expect(resultado).toMatchObject({ enviados: 0, fallos: 0 });
    expect(sendPaymentReminderEmail).not.toHaveBeenCalled();

    const hoy = new Date();
    const proximo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
    const consulta = fake.callsTo("payment_detail", "select")[0];
    expect(consulta.filters).toContainEqual(["eq", "month_number", proximo.getMonth() + 1]);
    expect(consulta.filters).toContainEqual(["eq", "year_number", proximo.getFullYear()]);
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

    expect(resultado).toMatchObject({ enviados: 1, fallos: 1 });
    expect(resultado.enviadosA).toEqual(["otro@test.com"]);
    expect(resultado.fallidosA).toEqual(["socio@test.com — SMTP down"]);
    expect(sendPaymentDebtEmail).toHaveBeenCalledTimes(2);
  });

  it("corta el lote cuando se agota el presupuesto de tiempo", async () => {
    vi.mocked(pagosService.getMiembrosMorosos).mockResolvedValue([moroso()]);
    iniciarPresupuesto(0);

    const resultado = await ejecutarMiembrosDeudores(fake.client, GYM);

    expect(resultado).toMatchObject({
      enviados: 0,
      fallos: 0,
      presupuestoAgotado: true,
    });
    expect(sendPaymentDebtEmail).not.toHaveBeenCalled();
  });
});

describe("ejecutarCorrida", () => {
  let fake: SupabaseFake;
  const configDeuda = {
    id: "cfg-deuda",
    notification_type: "miembros_deudores",
    daily_frequency: true,
  };

  /** Frecuencia (ultimoIntento) + purga: 2 selects sobre notification_log. */
  function encolarLogs(ultimoIntento: unknown = null, purga: unknown = null) {
    fake.on("notification_log", "select").reply((ultimoIntento ?? {}) as Record<string, unknown>);
    fake.on("notification_log", "select").reply((purga ?? {}) as Record<string, unknown>);
  }

  beforeEach(() => {
    configurarPausa(0);
    fake = createSupabaseFake();
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAIL", "admin@test.com");
    vi.mocked(sendPaymentDebtEmail).mockReset();
    vi.mocked(sendRunReportEmail).mockReset();
    vi.mocked(sendRunReportEmail).mockResolvedValue(undefined);
    vi.mocked(pagosService.getMiembrosMorosos).mockReset();
    vi.mocked(pagosService.getMiembrosMorosos).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    iniciarPresupuesto();
  });

  function cron() {
    return {
      configs: [configDeuda],
      gymConfig: GYM,
      origen: "cron",
      respetarFrecuencia: true,
      userId: "user-1",
    } as const;
  }

  it("sin destinatarios: no escribe bitácora y el reporte sale con cero envíos", async () => {
    encolarLogs();
    fake.on("profiles", "select").reply({ count: 80 });

    const resumen = await ejecutarCorrida(fake.client, cron());

    expect(resumen).toMatchObject({ ejecutadas: 1, enviados: 0, errores: 0, reporteEnviado: true });
    expect(fake.callsTo("notification_log", "insert")).toHaveLength(0);
    expect(sendRunReportEmail).toHaveBeenCalledTimes(1);
    expect(sendRunReportEmail).toHaveBeenCalledWith(
      "admin@test.com",
      expect.stringContaining("Reporte cron"),
      expect.any(String)
    );
    expect(resumen.reporteTexto).toContain("Miembros activos: 80");
    expect(resumen.reporteTexto).toContain("Enviados 0/80 (0.0%)");
    expect(resumen.reporteTexto).toContain("ERRORES: ninguno");
  });

  it("éxito: escribe el batch al final y lista a los destinatarios en el reporte", async () => {
    encolarLogs();
    fake.on("profiles", "select").reply({ count: 80 });
    vi.mocked(pagosService.getMiembrosMorosos).mockResolvedValue([moroso()]);
    vi.mocked(sendPaymentDebtEmail).mockResolvedValue(undefined);

    const resumen = await ejecutarCorrida(fake.client, cron());

    expect(resumen).toMatchObject({ ejecutadas: 1, enviados: 1, errores: 0 });

    const inserts = fake.callsTo("notification_log", "insert");
    expect(inserts).toHaveLength(1);
    expect(Array.isArray(inserts[0].payload)).toBe(true);
    expect(inserts[0].payload).toMatchObject([
      {
        notification_config_id: "cfg-deuda",
        members_notified: 1,
        no_issues: true,
        created_by: "user-1",
      },
    ]);
    expect(resumen.reporteTexto).toContain("Enviados 1/80 (1.3%)");
    expect(resumen.reporteTexto).toContain("Destinatarios: socio@test.com");
  });

  it("fallo de envío: sin bitácora y con el error en el reporte", async () => {
    encolarLogs();
    fake.on("profiles", "select").reply({ count: 80 });
    vi.mocked(pagosService.getMiembrosMorosos).mockResolvedValue([moroso()]);
    vi.mocked(sendPaymentDebtEmail).mockRejectedValue(new Error("SMTP down"));

    const resumen = await ejecutarCorrida(fake.client, cron());

    expect(resumen).toMatchObject({ ejecutadas: 1, enviados: 0, errores: 1 });
    expect(fake.callsTo("notification_log", "insert")).toHaveLength(0);
    expect(resumen.reporteTexto).toContain("ERRORES:");
    expect(resumen.reporteTexto).toContain(messages.notificaciones.envioParcial);
    expect(resumen.reporteTexto).toContain("socio@test.com — SMTP down");
  });

  it("excepción del procesador queda en el reporte (sin bitácora)", async () => {
    encolarLogs();
    fake.on("profiles", "select").reply({ count: 80 });
    vi.mocked(pagosService.getMiembrosMorosos).mockRejectedValue(new Error("RPC caído"));

    const resumen = await ejecutarCorrida(fake.client, cron());

    expect(resumen).toMatchObject({ ejecutadas: 1, enviados: 0, errores: 1 });
    expect(fake.callsTo("notification_log", "insert")).toHaveLength(0);
    expect(resumen.reporteTexto).toContain("RPC caído");
  });

  it("la ruta manual no envía el reporte", async () => {
    fake.on("notification_log", "select").reply({ data: null });

    const resumen = await ejecutarCorrida(fake.client, {
      configs: [configDeuda],
      gymConfig: GYM,
      origen: "manual",
      respetarFrecuencia: false,
      userId: "user-1",
    });

    expect(resumen).toMatchObject({ ejecutadas: 1, reporteTexto: null, reporteEnviado: null });
    expect(sendRunReportEmail).not.toHaveBeenCalled();
  });

  it("respetarFrecuencia salta el tipo sin ejecutarlo", async () => {
    encolarLogs({ data: { sent_at: new Date().toISOString() } });
    fake.on("profiles", "select").reply({ count: 80 });

    const resumen = await ejecutarCorrida(fake.client, cron());

    expect(resumen).toMatchObject({ ejecutadas: 0, enviados: 0, errores: 0 });
    expect(sendPaymentDebtEmail).not.toHaveBeenCalled();
    expect(fake.callsTo("notification_log", "insert")).toHaveLength(0);
    expect(resumen.reporteTexto).toContain(messages.notificaciones.reporte.saltadaFrecuencia);
  });

  it("todas saltadas: cero filas en bitácora (aunque ninguna falló)", async () => {
    const hoy = new Date().toISOString();
    // orden FIFO: frecuencia cfg1, frecuencia cfg2, purga cfg1, purga cfg2
    fake.on("notification_log", "select").reply({ data: { sent_at: hoy } });
    fake.on("notification_log", "select").reply({ data: { sent_at: hoy } });
    fake.on("notification_log", "select").reply({ data: null });
    fake.on("notification_log", "select").reply({ data: null });
    fake.on("profiles", "select").reply({ count: 80 });

    const resumen = await ejecutarCorrida(fake.client, {
      configs: [
        configDeuda,
        { id: "cfg-resumen", notification_type: "resumen_dueno", daily_frequency: true },
      ],
      gymConfig: GYM,
      origen: "cron",
      respetarFrecuencia: true,
      userId: "user-1",
    });

    expect(resumen).toMatchObject({ ejecutadas: 0, enviados: 0, errores: 0, reporteEnviado: true });
    expect(fake.callsTo("notification_log", "insert")).toHaveLength(0);
    expect(fake.callsTo("notification_log", "select")).toHaveLength(4);
    expect(resumen.reporteTexto).toContain("0/2 tipos ejecutados");
    expect(resumen.reporteTexto).toContain("saltada por frecuencia");
  });

  it("purga la bitácora dejando las 10 filas más recientes", async () => {
    const diezIds = Array.from({ length: LIMITE_BITACORA }, (_, i) => ({ id: `l${i + 1}` }));
    encolarLogs(null, { data: diezIds });
    fake.on("profiles", "select").reply({ count: 80 });
    vi.mocked(pagosService.getMiembrosMorosos).mockResolvedValue([moroso()]);
    vi.mocked(sendPaymentDebtEmail).mockResolvedValue(undefined);

    await ejecutarCorrida(fake.client, cron());

    const deletes = fake.callsTo("notification_log", "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].filters).toContainEqual([
      "not",
      "id",
      "in",
      '("l1","l2","l3","l4","l5","l6","l7","l8","l9","l10")',
    ]);
  });

  it("resumen sin correo de dueño falla en vez de pasar en silencio", async () => {
    encolarLogs();
    fake.on("profiles", "select").reply({ count: 80 });
    const configResumen = {
      id: "cfg-resumen",
      notification_type: "resumen_dueno",
      daily_frequency: true,
    };

    const resumen = await ejecutarCorrida(fake.client, { ...cron(), configs: [configResumen] });

    expect(resumen).toMatchObject({ ejecutadas: 1, enviados: 0, errores: 1 });
    expect(fake.callsTo("notification_log", "insert")).toHaveLength(0);
    expect(resumen.reporteTexto).toContain(messages.notificaciones.noDuenoEmail);
  });

  it("el límite de bitácora es 10 filas por tipo", () => {
    expect(LIMITE_BITACORA).toBe(10);
  });
});
