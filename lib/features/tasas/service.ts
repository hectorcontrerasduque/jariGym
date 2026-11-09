import type { SupabaseClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";
import {
  LIMITE_TASAS,
  necesitaActualizar,
  type TasaFila,
} from "./domain";
import { obtenerTasaBcv } from "./proveedores/dolarapi";

export type MotivoActualizacion =
  | "vigente"
  | "reciente"
  | "duplicado"
  | "error";

export interface ResultadoActualizacion {
  tasas: TasaFila[];
  actualizado: boolean;
  motivo?: MotivoActualizacion;
  error?: string;
}

/** Minimo entre dos escrituras (anti-hammer entre varios usuarios). */
const GUARD_MS = 10 * 60 * 1000;

/**
 * Lee/escribe el historial de tasas BCV.
 * Escrituras con client service_role (la RLS solo permite SELECT autenticado).
 */
export class TasasService {
  constructor(private readonly supabase: SupabaseClient) {}

  async obtenerTasas(): Promise<TasaFila[]> {
    const { data } = await this.supabase
      .from("exchange_rates")
      .select("id, effective_at, rate_bs, source, created_at")
      .order("effective_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LIMITE_TASAS);
    return (data as TasaFila[]) || [];
  }

  private async ultimaTasa(): Promise<TasaFila | null> {
    const { data } = await this.supabase
      .from("exchange_rates")
      .select("id, effective_at, rate_bs, source, created_at")
      .order("effective_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as TasaFila | null) ?? null;
  }

  private async existe(fila: { effectiveAt: string; rateBs: number }): Promise<boolean> {
    const { data } = await this.supabase
      .from("exchange_rates")
      .select("id")
      .eq("effective_at", fila.effectiveAt)
      .eq("rate_bs", fila.rateBs)
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  }

  private async podar(): Promise<void> {
    const { data } = await this.supabase
      .from("exchange_rates")
      .select("id")
      .order("effective_at", { ascending: false })
      .order("created_at", { ascending: false });
    const ids = ((data as Array<{ id: number }>) || []).map((r) => r.id);
    if (ids.length <= LIMITE_TASAS) return;
    await this.supabase.from("exchange_rates").delete().in("id", ids.slice(LIMITE_TASAS));
  }

  /**
   * Intenta refrescar la tasa desde el proveedor.
   * - forzar=false (automatico): solo consulta si la ultima vigencia tiene
   *   mas de HORAS_VIGENCIA o si no hay registro, y si no hubo escritura
   *   en los ultimos GUARD_MS.
   * - forzar=true (boton "Actualizar"): siempre consulta (el rate limit
   *   por usuario sigue aplicando en la ruta).
   * Fail-open: cualquier fallo devuelve las tasas actuales sin lanzar.
   */
  async actualizar(opts: { forzar?: boolean; hoy?: Date } = {}): Promise<ResultadoActualizacion> {
    const { forzar = false, hoy = new Date() } = opts;
    const ultima = await this.ultimaTasa();

    if (!forzar && ultima) {
      if (!necesitaActualizar(ultima.effective_at, hoy)) {
        return { tasas: await this.obtenerTasas(), actualizado: false, motivo: "vigente" };
      }
      const escritaHacePoco =
        ultima.created_at !== undefined &&
        hoy.getTime() - Date.parse(ultima.created_at) < GUARD_MS;
      if (escritaHacePoco) {
        return { tasas: await this.obtenerTasas(), actualizado: false, motivo: "reciente" };
      }
    }

    const tasa = await obtenerTasaBcv();
    if (!tasa) {
      return {
        tasas: await this.obtenerTasas(),
        actualizado: false,
        motivo: "error",
        error: messages.tasas.errorProveedor,
      };
    }

    if (await this.existe(tasa)) {
      return { tasas: await this.obtenerTasas(), actualizado: false, motivo: "duplicado" };
    }

    const { error } = await this.supabase.from("exchange_rates").insert({
      effective_at: tasa.effectiveAt,
      rate_bs: tasa.rateBs,
      source: "dolarapi",
    });
    if (error) {
      return {
        tasas: await this.obtenerTasas(),
        actualizado: false,
        motivo: "error",
        error: error.message,
      };
    }

    await this.podar();
    return { tasas: await this.obtenerTasas(), actualizado: true };
  }
}
