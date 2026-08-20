import { createClient } from "@/lib/supabase/client";
import { messages } from "@/lib/messages";
import type { GymConfig, MetodoPago, MetodoPagoConfig } from "@/lib/types";

const METODOS_DEFAULT: { metodo_pago: MetodoPago; habilitado: boolean }[] = [
  { metodo_pago: "efectivo", habilitado: true },
  { metodo_pago: "bs", habilitado: false },
  { metodo_pago: "binance", habilitado: false },
];

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
      .select("id, dueno_email")
      .limit(1)
      .single();

    if (existing && updates.dueno_email && updates.dueno_email !== existing.dueno_email) {
      const { data: newOwnerProfile } = await this.supabase
        .from("profiles")
        .select("id, activo, role")
        .eq("email", updates.dueno_email)
        .maybeSingle();

      if (newOwnerProfile && newOwnerProfile.activo !== false && newOwnerProfile.role !== "super_admin") {
        throw new Error("Este correo ya está registrado como miembro activo. Use otro correo.");
      }

      if (existing.dueno_email) {
        const { data: oldOwnerProfile } = await this.supabase
          .from("profiles")
          .select("id")
          .eq("email", existing.dueno_email)
          .maybeSingle();
        if (oldOwnerProfile) {
          await this.supabase
            .from("profiles")
            .update({ activo: false })
            .eq("id", oldOwnerProfile.id);
        }
      }

      if (newOwnerProfile && newOwnerProfile.activo === false) {
        await this.supabase
          .from("profiles")
          .update({ activo: true, role: "super_admin", registered: true })
          .eq("id", newOwnerProfile.id);
      } else if (!newOwnerProfile) {
        try {
          await fetch("/api/auth/ensure-super-admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: updates.dueno_email }),
          });
        } catch {}
      }
    }

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
    const { data: existing } = await this.supabase
      .from("gym_config_metodos_pago")
      .select("*")
      .order("metodo_pago");

    const existingMap = new Map((existing || []).map((m) => [m.metodo_pago, m]));

    for (const def of METODOS_DEFAULT) {
      if (!existingMap.has(def.metodo_pago)) {
        const { data: inserted } = await this.supabase
          .from("gym_config_metodos_pago")
          .insert({
            metodo_pago: def.metodo_pago,
            monto_mensual: 0,
            monto_inscripcion: 0,
            habilitado: def.habilitado,
          })
          .select()
          .single();
        if (inserted) existingMap.set(def.metodo_pago, inserted);
      }
    }

    return Array.from(existingMap.values()).sort((a, b) => a.metodo_pago.localeCompare(b.metodo_pago));
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
