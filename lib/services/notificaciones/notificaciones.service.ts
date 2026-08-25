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

  private defaultConfigs = [
    { tipo_notificacion: "miembros_deudores", habilitado: true, frecuencia_semanal: true, frecuencia_quincenal: false, frecuencia_mensual: false, dias_previo: 7, notificar_por_email: true, notificar_por_whatsapp: false },
    { tipo_notificacion: "recordatorio_pago", habilitado: true, frecuencia_semanal: false, frecuencia_quincenal: true, frecuencia_mensual: false, dias_previo: 7, notificar_por_email: true, notificar_por_whatsapp: false },
    { tipo_notificacion: "resumen_dueno", habilitado: true, frecuencia_semanal: true, frecuencia_quincenal: false, frecuencia_mensual: false, dias_previo: 7, notificar_por_email: true, notificar_por_whatsapp: false },
    { tipo_notificacion: "estatus_sistema", habilitado: true, frecuencia_semanal: false, frecuencia_quincenal: false, frecuencia_mensual: true, dias_previo: 7, notificar_por_email: true, notificar_por_whatsapp: false },
  ];

  async ensureDefaultConfigs(): Promise<void> {
    const { data: existing } = await this.supabase
      .from("notificacion_config")
      .select("id")
      .limit(1);

    if (existing && existing.length > 0) return;

    const { error } = await this.supabase
      .from("notificacion_config")
      .insert(this.defaultConfigs);
    if (error) throw error;
  }

  async getNotificacionesConfig(): Promise<NotificacionConfig[]> {
    await this.ensureDefaultConfigs();
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

  async procesarTodasLasNotificaciones(tipo?: string, forzar = false): Promise<{
    ejecutadas: number;
    enviados: number;
    errores: number;
  }> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;

    const body: Record<string, unknown> = {};
    if (tipo) body.tipo = tipo;
    if (forzar) body.forzar = true;

    const res = await fetch("/api/notificaciones/procesar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
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
