import { createClient } from "@/lib/supabase/client";
import type { GymConfig, NotificacionConfig, NotificacionLog } from "@/lib/types";

export class NotificacionesService {
  private supabase = createClient();

  // ─── CONFIG GLOBAL ─────────────────────────────

  async getConfigGlobal(): Promise<GymConfig | null> {
    const { data, error } = await this.supabase
      .from("gym_config")
      .select("*")
      .limit(1)
      .single();
    if (error || !data) return null;
    return data;
  }

  async updateConfigGlobal(updates: Partial<GymConfig>): Promise<void> {
    const { data: existing } = await this.supabase
      .from("gym_config")
      .select("id")
      .limit(1)
      .single();
    if (!existing) return;
    const { error } = await this.supabase
      .from("gym_config")
      .update({ notificaciones_enabled: updates.notificaciones_enabled })
      .eq("id", existing.id);
    if (error) throw error;
  }

  // ─── CONFIG POR TIPO ──────────────────────────

  async getNotificacionesConfig(): Promise<NotificacionConfig[]> {
    const { data, error } = await this.supabase
      .from("notificacion_config")
      .select("*")
      .order("tipo_notificacion");
    if (error) throw error;
    return data || [];
  }

  async getNotificacionConfigByTipo(tipo: string): Promise<NotificacionConfig | null> {
    const { data } = await this.supabase
      .from("notificacion_config")
      .select("*")
      .eq("tipo_notificacion", tipo)
      .single();
    return data;
  }

  async updateNotificacionConfig(id: string, updates: Partial<NotificacionConfig>): Promise<void> {
    const { error } = await this.supabase
      .from("notificacion_config")
      .update(updates)
      .eq("id", id);
    if (error) throw error;
  }

  // ─── EJECUTAR NOTIFICACIONES (via API) ────────

  async procesarTodasLasNotificaciones(): Promise<{
    ejecutadas: number;
    enviados: number;
    errores: number;
  }> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch("/api/notificaciones/procesar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error desconocido" }));
      throw new Error(err.error || "Error al procesar notificaciones");
    }

    return res.json();
  }

  // ─── DIAGNÓSTICO (via API) ────────────────────

  async ejecutarDiagnostico(): Promise<{
    exitoso: boolean;
    resultados: Array<{
      paso: string;
      estado: "ok" | "error" | "warning";
      detalle: string;
    }>;
  }> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch("/api/notificaciones/diagnostico", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error desconocido" }));
      throw new Error(err.error || "Error al ejecutar diagnóstico");
    }

    return res.json();
  }

  // ─── HISTORIAL ────────────────────────────────

  async getHistorial(limit = 50): Promise<NotificacionLog[]> {
    const { data, error } = await this.supabase
      .from("notificacion_log")
      .select("*, notificacion_config(*)")
      .order("fecha_hora_envio", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
}

export const notificacionesService = new NotificacionesService();
