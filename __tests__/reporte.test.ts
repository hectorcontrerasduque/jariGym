import { describe, it, expect } from "vitest";
import {
  asuntoReporte,
  construirReporteCorrida,
  debeEnviarReporte,
  fechaVet,
  labelTipo,
  porcentajeCobertura,
  reporteATexto,
  type EntradaReporte,
} from "@/lib/features/notificaciones/reporte";
import { messages } from "@/lib/messages";

function plantilla(overrides: Partial<EntradaReporte["plantillas"][number]> = {}) {
  return {
    configId: "cfg-1",
    tipo: "miembros_deudores",
    label: "Miembros Morosos",
    estado: "ejecutada" as const,
    frecuencia: "Semanal",
    ultimoIntento: null,
    enviados: 0,
    fallos: 0,
    destinatarios: [] as string[],
    fallidos: [] as string[],
    error: null,
    presupuestoAgotado: false,
    ...overrides,
  };
}

function entrada(overrides: Partial<EntradaReporte> = {}): EntradaReporte {
  return {
    fecha: new Date("2026-10-07T04:23:00Z"),
    origen: "cron",
    expresionCron: "0 4 * * *",
    duracionMs: 41200,
    miembrosActivos: 80,
    plantillas: [],
    ...overrides,
  };
}

describe("porcentajeCobertura", () => {
  it("calcula con un decimal", () => {
    expect(porcentajeCobertura(0, 80)).toBe("0.0%");
    expect(porcentajeCobertura(1, 80)).toBe("1.3%");
    expect(porcentajeCobertura(10, 80)).toBe("12.5%");
    expect(porcentajeCobertura(80, 80)).toBe("100.0%");
  });

  it("sin base no aplica", () => {
    expect(porcentajeCobertura(5, 0)).toBe("—");
  });
});

describe("fechaVet", () => {
  it("convierte UTC a hora de Venezuela (UTC-4)", () => {
    expect(fechaVet(new Date("2026-10-07T04:23:00Z"))).toBe("07/10/2026 00:23");
  });

  it("cruza la medianoche hacia el día anterior", () => {
    expect(fechaVet(new Date("2026-01-01T02:00:00Z"))).toBe("31/12/2025 22:00");
  });
});

describe("labelTipo", () => {
  it("usa los nombres centralizados", () => {
    expect(labelTipo("miembros_deudores")).toBe(messages.notificaciones.tipoMiembrosDeudores);
    expect(labelTipo("recordatorio_pago")).toBe(messages.notificaciones.tipoRecordatorioPago);
    expect(labelTipo("resumen_dueno")).toBe(messages.notificaciones.tipoResumenDueno);
    expect(labelTipo("estatus_sistema")).toBe(messages.notificaciones.tipoEstatusSistema);
  });

  it("con tipo desconocido devuelve el propio tipo", () => {
    expect(labelTipo("otro")).toBe("otro");
  });
});

describe("construirReporteCorrida", () => {
  it("suma totales y calcula % por plantilla (solo las ejecutadas)", () => {
    const reporte = construirReporteCorrida(
      entrada({
        plantillas: [
          plantilla({ configId: "a", enviados: 10, destinatarios: ["a@x"] }),
          plantilla({
            configId: "b",
            tipo: "recordatorio_pago",
            label: "Recordatorio de Pago",
            estado: "saltada_frecuencia",
          }),
        ],
      })
    );

    expect(reporte.totales).toEqual({ enviados: 10, errores: 0, ejecutadas: 1, saltadas: 1 });
    expect(reporte.plantillas[0].porcentaje).toBe("12.5%");
    expect(reporte.plantillas[1].porcentaje).toBe("—");
    expect(reporte.fecha).toBe("07/10/2026 00:23");
    expect(reporte.duracionSeg).toBe("41.2");
  });

  it("cuenta como error toda ejecutada con fallos o mensaje", () => {
    const reporte = construirReporteCorrida(
      entrada({
        plantillas: [
          plantilla({ configId: "a", fallos: 1, error: "parcial" }),
          plantilla({ configId: "b", error: "excepción" }),
          plantilla({ configId: "c" }),
        ],
      })
    );

    expect(reporte.totales).toEqual({ enviados: 0, errores: 2, ejecutadas: 3, saltadas: 0 });
  });
});

describe("reporteATexto", () => {
  it("monta cabecera, plantillas, errores y totales", () => {
    const reporte = construirReporteCorrida(
      entrada({
        plantillas: [
          plantilla({
            configId: "a",
            enviados: 10,
            destinatarios: ["juan@x", "maria@x"],
            presupuestoAgotado: true,
            ultimoIntento: "01/10/2026",
          }),
          plantilla({
            configId: "b",
            tipo: "recordatorio_pago",
            label: "Recordatorio de Pago",
            estado: "saltada_frecuencia",
            frecuencia: "Diario",
            ultimoIntento: "06/10/2026",
          }),
          plantilla({
            configId: "c",
            tipo: "estatus_sistema",
            label: "Estado del Sistema",
            enviados: 1,
            fallos: 1,
            fallidos: ["admin@x — timeout"],
            error: "Fallo parcial en el envío de la notificación (enviados: 1, fallos: 1)",
          }),
          plantilla({
            configId: "d",
            tipo: "resumen_dueno",
            label: "Resumen al Dueño",
            estado: "presupuesto",
          }),
        ],
        advertencias: ["Purga de bitácora: permiso denegado"],
      })
    );

    const texto = reporteATexto(reporte);

    expect(texto).toContain("REPORTE DE CRON — 07/10/2026 00:23");
    expect(texto).toContain("Expresión: 0 4 * * *");
    expect(texto).toContain("Duración: 41.2 s");
    expect(texto).toContain("Miembros activos: 80");

    expect(texto).toContain(
      "Miembros Morosos — ejecutada (frecuencia: Semanal · último intento: 01/10/2026)"
    );
    expect(texto).toContain("Enviados 10/80 (12.5%) · Fallos 0 · detenida por presupuesto de tiempo");
    expect(texto).toContain("Destinatarios: juan@x, maria@x");

    expect(texto).toContain(
      "Recordatorio de Pago — saltada por frecuencia (frecuencia: Diario · último intento: 06/10/2026)"
    );
    expect(texto).toContain("Resumen al Dueño — no ejecutada: presupuesto agotado");

    expect(texto).toContain("Fallidos: admin@x — timeout");
    expect(texto).toContain("ERRORES:");
    expect(texto).toContain(
      "- Estado del Sistema: Fallo parcial en el envío de la notificación (enviados: 1, fallos: 1)"
    );
    expect(texto).toContain("Advertencias:");
    expect(texto).toContain("- Purga de bitácora: permiso denegado");

    expect(texto).toContain("Totales: 11 envíos · 1 errores · 2/4 tipos ejecutados · 2 no ejecutados");
    expect(texto).toContain(messages.notificaciones.reporte.pie);
  });

  it("sin errores dice 'ninguno'", () => {
    const reporte = construirReporteCorrida(entrada({ plantillas: [plantilla({ enviados: 3 })] }));
    expect(reporteATexto(reporte)).toContain("ERRORES: ninguno");
  });

  it("incluye el error fatal cuando la ruta revienta", () => {
    const reporte = construirReporteCorrida(entrada({ errorFatal: "DB caída" }));
    const texto = reporteATexto(reporte);
    expect(texto).toContain("ERRORES:");
    expect(texto).toContain("- Error: DB caída");
    expect(texto).toContain("Totales: 0 envíos · 0 errores · 0/0 tipos ejecutados · 0 no ejecutados");
  });
});

describe("debeEnviarReporte", () => {
  it("todo saltado por frecuencia y sin avisos: no merece correo", () => {
    const reporte = construirReporteCorrida(
      entrada({
        plantillas: [
          plantilla({ estado: "saltada_frecuencia" }),
          plantilla({ configId: "b", estado: "saltada_frecuencia" }),
        ],
      })
    );
    expect(debeEnviarReporte(reporte)).toBe(false);
  });

  it("ejecutada sin destinatarios y sin errores: no merece correo", () => {
    const reporte = construirReporteCorrida(entrada({ plantillas: [plantilla()] }));
    expect(debeEnviarReporte(reporte)).toBe(false);
  });

  it("con envíos, errores, advertencias o fallo fatal: merece correo", () => {
    const conEnvios = construirReporteCorrida(
      entrada({ plantillas: [plantilla({ enviados: 1 })] })
    );
    const conErrores = construirReporteCorrida(
      entrada({ plantillas: [plantilla({ fallos: 1, error: "parcial" })] })
    );
    const conAviso = construirReporteCorrida(
      entrada({ advertencias: ["Purga de bitácora: permiso denegado"] })
    );
    const fatal = construirReporteCorrida(entrada({ errorFatal: "DB caída" }));

    expect(debeEnviarReporte(conEnvios)).toBe(true);
    expect(debeEnviarReporte(conErrores)).toBe(true);
    expect(debeEnviarReporte(conAviso)).toBe(true);
    expect(debeEnviarReporte(fatal)).toBe(true);
  });
});

describe("asuntoReporte", () => {
  it("resume gym, fecha y totales", () => {
    const reporte = construirReporteCorrida(
      entrada({ plantillas: [plantilla({ enviados: 12 })] })
    );
    expect(asuntoReporte(reporte, "Mi Gym")).toBe(
      "Mi Gym — Reporte cron 07/10/2026 00:23 — 12 envíos, 0 errores"
    );
  });
});
