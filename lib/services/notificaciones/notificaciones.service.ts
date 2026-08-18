import { createClient } from "@/lib/supabase/client";
import type { NotificacionesConfig } from "@/lib/types";

export class NotificacionesService {
  private supabase = createClient();

  async getConfig(): Promise<NotificacionesConfig | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data } = await this.supabase
      .from("notificaciones_config")
      .select("*")
      .eq("usuario_id", user.id)
      .single();

    return data;
  }

  async updateConfig(
    updates: Partial<NotificacionesConfig>
  ): Promise<NotificacionesConfig> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    const { data: existing } = await this.supabase
      .from("notificaciones_config")
      .select("id")
      .eq("usuario_id", user.id)
      .single();

    if (existing) {
      const { data, error } = await this.supabase
        .from("notificaciones_config")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await this.supabase
        .from("notificaciones_config")
        .insert({ ...updates, usuario_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  }

  async enviarNotificacionPago(usuarioId: string, tipo: string) {
    const config = await this.getConfigForUser(usuarioId);
    if (!config) return;

    if (config.email_enabled) {
      await this.enviarEmail(usuarioId, tipo);
    }

    if (config.whatsapp_enabled && config.whatsapp_number) {
      await this.enviarWhatsApp(config.whatsapp_number, tipo);
    }
  }

  private async getConfigForUser(
    usuarioId: string
  ): Promise<NotificacionesConfig | null> {
    const { data } = await this.supabase
      .from("notificaciones_config")
      .select("*")
      .eq("usuario_id", usuarioId)
      .single();

    return data;
  }

  private async enviarEmail(usuarioId: string, tipo: string) {
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("nombre_completo")
      .eq("id", usuarioId)
      .single();

    await this.supabase.from("notificaciones_log").insert({
      usuario_id: usuarioId,
      tipo,
      canal: "email",
      enviado: true,
    });
  }

  private async enviarWhatsApp(numero: string, tipo: string) {
    await this.supabase.from("notificaciones_log").insert({
      tipo,
      canal: "whatsapp",
      enviado: true,
    });
  }
}

export const notificacionesService = new NotificacionesService();
