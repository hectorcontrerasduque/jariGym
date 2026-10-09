import { messages } from "@/lib/messages";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrigenEjecucion } from "./ejecucion";

/**
 * Reporte de corrida del cron: resumen en **texto plano** que se envía al
 * super admin técnico (`NEXT_PUBLIC_ADMIN_EMAIL`) al final de cada corrida del
 * cron. La ruta manual no lo envía.
 *
 * Todo lo visualmente "puro" (totales, %, texto) vive aquí y se prueba con
 * datos literales.
 */

export type EstadoPlantilla = "ejecutada" | "saltada_frecuencia" | "presupuesto";

export type PlantillaReporte = {
  configId: string;
  tipo: string;
  label: string;
  estado: EstadoPlantilla;
  frecuencia: string | null;
  ultimoIntento: string | null;
  enviados: number;
  fallos: number;
  porcentaje: string;
  destinatarios: string[];
  fallidos: string[];
  error: string | null;
  presupuestoAgotado: boolean;
};

export type PlantillaEntrada = Omit<PlantillaReporte, "porcentaje">;

export type ReporteCorrida = {
  fecha: string;
  origen: OrigenEjecucion;
  expresionCron: string | null;
  duracionSeg: string;
  miembrosActivos: number;
  plantillas: PlantillaReporte[];
  advertencias: string[];
  errorFatal: string | null;
  totales: { enviados: number; errores: number; ejecutadas: number; saltadas: number };
};

export type EntradaReporte = {
  fecha: Date;
  origen: OrigenEjecucion;
  expresionCron?: string | null;
  duracionMs: number;
  miembrosActivos: number;
  plantillas: PlantillaEntrada[];
  advertencias?: string[];
  errorFatal?: string | null;
};

export function labelTipo(tipo: string): string {
  switch (tipo) {
    case "miembros_deudores":
      return messages.notificaciones.tipoMiembrosDeudores;
    case "recordatorio_pago":
      return messages.notificaciones.tipoRecordatorioPago;
    case "resumen_dueno":
      return messages.notificaciones.tipoResumenDueno;
    case "estatus_sistema":
      return messages.notificaciones.tipoEstatusSistema;
    default:
      return tipo;
  }
}

/** Cobertura: envíos del tipo ÷ miembros activos (1 decimal). Sin base → "—". */
export function porcentajeCobertura(enviados: number, activos: number): string {
  if (activos <= 0) return "—";
  return `${((enviados / activos) * 100).toFixed(1)}%`;
}

/** `dd/MM/yyyy HH:mm` en hora de Venezuela (UTC-4, sin horario de verano). */
export function fechaVet(fecha: Date): string {
  const v = new Date(fecha.getTime() - 4 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${p(v.getUTCDate())}/${p(v.getUTCMonth() + 1)}/${v.getUTCFullYear()} ` +
    `${p(v.getUTCHours())}:${p(v.getUTCMinutes())}`
  );
}

export function construirReporteCorrida(entrada: EntradaReporte): ReporteCorrida {
  const plantillas: PlantillaReporte[] = entrada.plantillas.map((p) => ({
    ...p,
    porcentaje:
      p.estado === "ejecutada"
        ? porcentajeCobertura(p.enviados, entrada.miembrosActivos)
        : "—",
  }));

  let enviados = 0;
  let errores = 0;
  let ejecutadas = 0;
  let saltadas = 0;

  for (const p of plantillas) {
    enviados += p.enviados;
    if (p.estado === "ejecutada") {
      ejecutadas++;
      if (p.fallos > 0 || p.error) errores++;
    } else {
      saltadas++;
    }
  }

  return {
    fecha: fechaVet(entrada.fecha),
    origen: entrada.origen,
    expresionCron: entrada.expresionCron ?? null,
    duracionSeg: (entrada.duracionMs / 1000).toFixed(1),
    miembrosActivos: entrada.miembrosActivos,
    plantillas,
    advertencias: entrada.advertencias ?? [],
    errorFatal: entrada.errorFatal ?? null,
    totales: { enviados, errores, ejecutadas, saltadas },
  };
}

/**
 * ¿El reporte merece llegar al correo? Solo si hay información: envíos,
 * errores, advertencias o fallo fatal. Una corrida donde todo se saltó por
 * frecuencia (0 envíos, 0 errores, sin avisos) no genera correo.
 */
export function debeEnviarReporte(reporte: ReporteCorrida): boolean {
  return (
    reporte.totales.enviados > 0 ||
    reporte.totales.errores > 0 ||
    reporte.advertencias.length > 0 ||
    reporte.errorFatal != null
  );
}

function estadoTexto(p: PlantillaReporte): string {
  const r = messages.notificaciones.reporte;
  const contexto: string[] = [];
  if (p.frecuencia) contexto.push(`${r.frecuencia}: ${p.frecuencia}`);
  if (p.ultimoIntento) contexto.push(`${r.ultimoIntento}: ${p.ultimoIntento}`);
  const sufijo = contexto.length > 0 ? ` (${contexto.join(" · ")})` : "";

  if (p.estado === "saltada_frecuencia") return `${r.saltadaFrecuencia}${sufijo}`;
  if (p.estado === "presupuesto") return r.noEjecutadaPresupuesto;
  return `${r.ejecutada}${sufijo}`;
}

/** Texto plano completo del reporte (lo que llega al buzón del admin técnico). */
export function reporteATexto(reporte: ReporteCorrida): string {
  const r = messages.notificaciones.reporte;
  const lineas: string[] = [];

  const cabecera = [`${r.titulo} — ${reporte.fecha}`];
  if (reporte.expresionCron) cabecera.push(`${r.expresion}: ${reporte.expresionCron}`);
  cabecera.push(`${r.duracion}: ${reporte.duracionSeg} s`);
  lineas.push(cabecera.join(" · "));
  lineas.push(`${r.miembrosActivos}: ${reporte.miembrosActivos}`);
  lineas.push("");

  for (const p of reporte.plantillas) {
    lineas.push(`${p.label} — ${estadoTexto(p)}`);
    if (p.estado === "ejecutada") {
      const extra = p.presupuestoAgotado ? ` · ${r.detenidaPresupuesto}` : "";
      lineas.push(
        `  ${r.enviados} ${p.enviados}/${reporte.miembrosActivos} (${p.porcentaje}) · ${r.fallos} ${p.fallos}${extra}`
      );
      if (p.destinatarios.length > 0) {
        lineas.push(`  ${r.destinatarios}: ${p.destinatarios.join(", ")}`);
      }
      if (p.fallidos.length > 0) {
        lineas.push(`  ${r.fallidos}: ${p.fallidos.join(", ")}`);
      }
      if (p.error) lineas.push(`  ${r.error}: ${p.error}`);
    }
    lineas.push("");
  }

  const problemas: string[] = [];
  for (const p of reporte.plantillas) {
    if (p.estado === "ejecutada" && p.error) problemas.push(`${p.label}: ${p.error}`);
  }
  if (reporte.errorFatal) problemas.push(`${r.error}: ${reporte.errorFatal}`);

  lineas.push(
    problemas.length > 0
      ? `${r.errores}:\n${problemas.map((x) => `- ${x}`).join("\n")}`
      : `${r.errores}: ${r.sinErrores}`
  );

  if (reporte.advertencias.length > 0) {
    lineas.push(`${r.advertencias}:`);
    for (const adv of reporte.advertencias) lineas.push(`- ${adv}`);
  }

  const { enviados, errores, ejecutadas, saltadas } = reporte.totales;
  const total = ejecutadas + saltadas;
  lineas.push(
    `${r.totales}: ${enviados} ${r.envios} · ${errores} ${r.erroresCorto} · ` +
      `${ejecutadas}/${total} ${r.tiposEjecutados} · ${saltadas} ${r.saltados}`
  );
  lineas.push("");
  lineas.push(r.pie);

  return lineas.join("\n");
}

export function asuntoReporte(reporte: ReporteCorrida, gymName: string): string {
  const r = messages.notificaciones.reporte;
  return (
    `${gymName} — ${r.asunto} ${reporte.fecha} — ` +
    `${reporte.totales.enviados} ${r.envios}, ${reporte.totales.errores} ${r.erroresCorto}`
  );
}

/** Miembros activos = perfiles con `activo IS NOT FALSE` (null cuenta como activo). */
export async function contarMiembrosActivos(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("activo", "is", false);
  return count ?? 0;
}

/** Envía el texto al admin técnico. Devuelve false si no hubo destino o falló. */
export async function enviarReporteTexto(asunto: string, texto: string): Promise<boolean> {
  const destino = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!destino) return false;
  try {
    const { sendRunReportEmail } = await import("@/lib/services/email/email.service");
    await sendRunReportEmail(destino, asunto, texto);
    return true;
  } catch {
    return false;
  }
}
