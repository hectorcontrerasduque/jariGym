import vercelConfig from "../../../vercel.json";

/**
 * Horario del cron de notificaciones, leído de `vercel.json` (se compila en el
 * build, así que la UI siempre muestra lo que realmente está desplegado).
 *
 * En el plan Hobby Vercel dispara en cualquier minuto dentro de la hora
 * indicada (precisión por hora), por eso la ventana se informa como `HH:00–HH:59`.
 */
export type HorarioCron = {
  /** Expresión cron tal cual está en vercel.json (UTC). */
  expresion: string;
  /** Ventana en UTC (`HH:00–HH:59`) o null si la expresión no es diaria. */
  ventanaUtc: string | null;
  /** Ventana en hora de Venezuela (UTC-4). */
  ventanaVet: string | null;
};

function horaVentana(horaUtc: number): string {
  const h = ((horaUtc % 24) + 24) % 24;
  return String(h).padStart(2, "0");
}

export function horarioNotificaciones(): HorarioCron | null {
  const crons = (vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? [];
  const job = crons.find((c) => c.path === "/api/notificaciones");
  if (!job || !job.schedule) return null;

  const partes = job.schedule.trim().split(/\s+/);
  const esDiaria =
    partes.length === 5 && partes[2] === "*" && partes[3] === "*" && partes[4] === "*";
  const hora = esDiaria ? Number(partes[1]) : NaN;
  if (!esDiaria || !Number.isInteger(hora) || hora < 0 || hora > 23) {
    return { expresion: job.schedule, ventanaUtc: null, ventanaVet: null };
  }

  return {
    expresion: job.schedule,
    ventanaUtc: `${horaVentana(hora)}:00–${horaVentana(hora)}:59`,
    ventanaVet: `${horaVentana(hora - 4)}:00–${horaVentana(hora - 4)}:59`,
  };
}
