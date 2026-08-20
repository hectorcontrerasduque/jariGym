import { createClient } from "@/lib/supabase/client";
import { messages } from "@/lib/messages";
import type { GymConfig, MetodoPago, MetodoPagoConfig } from "@/lib/types";

export class ConfigService {
  private supabase = createClient();

  async getConfig(): Promise<GymConfig | null> {
    const { data, error } = await this.supabase
      .from("gym_config")
      .select("*")
      .limit(1)
      .single();

    if (error || !data) return null;
    return data;
  }

  async updateConfig(updates: Partial<GymConfig>): Promise<GymConfig> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    const { data: profile } = await this.supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "super_admin" && profile?.role !== "admin") {
      throw new Error(messages.toast.noAutorizado);
    }

    const { data: existing } = await this.supabase
      .from("gym_config")
      .select("id")
      .limit(1)
      .single();

    const { id, created_at, updated_at, ...safeUpdates } = updates as GymConfig;

    if (existing) {
      const { data, error } = await this.supabase
        .from("gym_config")
        .update(safeUpdates)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await this.supabase
        .from("gym_config")
        .insert(safeUpdates)
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  }

  async getMetodosPago(): Promise<MetodoPagoConfig[]> {
    const { data, error } = await this.supabase
      .from("gym_config_metodos_pago")
      .select("*")
      .eq("habilitado", true)
      .order("metodo_pago");

    if (error) throw error;
    return data || [];
  }

  async updateMetodoPago(id: string, updates: Partial<MetodoPagoConfig>): Promise<MetodoPagoConfig> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    const { data: profile } = await this.supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "super_admin" && profile?.role !== "admin") {
      throw new Error(messages.toast.noAutorizado);
    }

    const { data: current } = await this.supabase
      .from("gym_config_metodos_pago")
      .select("metodo_pago, monto_mensual, monto_inscripcion, habilitado")
      .eq("id", id)
      .single();

    if (!current) throw new Error("Método de pago no encontrado");

    const montoMensual = updates.monto_mensual ?? current.monto_mensual;
    const montoInscripcion = updates.monto_inscripcion ?? current.monto_inscripcion;
    const habilitado = updates.habilitado !== undefined ? updates.habilitado : current.habilitado;

    const { data, error } = await this.supabase
      .rpc("actualizar_metodo_pago_atomico", {
        p_id: id,
        p_monto_mensual: montoMensual,
        p_monto_inscripcion: montoInscripcion,
        p_habilitado: habilitado,
      });

    if (error) throw error;
    return data as MetodoPagoConfig;
  }

  async getMetodoPago(metodo: MetodoPago): Promise<MetodoPagoConfig | null> {
    const { data, error } = await this.supabase
      .from("gym_config_metodos_pago")
      .select("*")
      .eq("metodo_pago", metodo)
      .eq("habilitado", true)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  }
}

export const configService = new ConfigService();
