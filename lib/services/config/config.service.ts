import { createClient } from "@/lib/supabase/client";
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
    if (!user) throw new Error("No autenticado");

    const { data: existing } = await this.supabase
      .from("gym_config")
      .select("id")
      .limit(1)
      .single();

    if (existing) {
      const { data, error } = await this.supabase
        .from("gym_config")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await this.supabase
        .from("gym_config")
        .insert(updates)
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
    const { data: current } = await this.supabase
      .from("gym_config_metodos_pago")
      .select("metodo_pago, monto_mensual, monto_inscripcion")
      .eq("id", id)
      .single();

    if (!current) throw new Error("Método de pago no encontrado");

    await this.supabase
      .from("gym_config_metodos_pago")
      .update({ habilitado: false })
      .eq("id", id);

    const nuevoRegistro = {
      metodo_pago: current.metodo_pago,
      monto_mensual: updates.monto_mensual ?? current.monto_mensual,
      monto_inscripcion: updates.monto_inscripcion ?? current.monto_inscripcion,
      habilitado: updates.habilitado !== undefined ? updates.habilitado : true,
    };

    const { data, error } = await this.supabase
      .from("gym_config_metodos_pago")
      .insert(nuevoRegistro)
      .select()
      .single();

    if (error) throw error;
    return data;
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
