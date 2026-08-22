import { createClient } from "@/lib/supabase/client";
import { messages } from "@/lib/messages";
import type { GymConfig, MetodoPago, MetodoPagoConfig } from "@/lib/types";

export const METODOS_PAGO_DEFAULT: MetodoPago[] = ["efectivo", "bs", "binance"];

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

    if (updates.dueno_email) {
      if (existing && updates.dueno_email !== existing.dueno_email) {
        const { data: newOwnerProfile } = await this.supabase
          .from("profiles")
          .select("id, activo, role")
          .eq("email", updates.dueno_email)
          .maybeSingle();

        if (newOwnerProfile && newOwnerProfile.activo !== false && newOwnerProfile.role !== "super_admin") {
          throw new Error(messages.notificaciones.emailYaRegistradoActivo);
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
              body: JSON.stringify({ email: updates.dueno_email, nombre: updates.dueno_nombre, inscripcion_pagada: true }),
            });
          } catch (error) {
            console.error("[ConfigService] Error calling ensure-super-admin (existing owner path)", error);
          }
        }
      } else if (!existing) {
        const { data: existingProfile } = await this.supabase
          .from("profiles")
          .select("id, activo, role")
          .eq("email", updates.dueno_email)
          .maybeSingle();

        if (existingProfile && existingProfile.activo !== false && existingProfile.role !== "super_admin") {
          throw new Error(messages.notificaciones.emailYaRegistradoActivo);
        }

        if (existingProfile && existingProfile.activo === false) {
          await this.supabase
            .from("profiles")
            .update({ activo: true, role: "super_admin", registered: true })
            .eq("id", existingProfile.id);
        } else if (!existingProfile) {
          try {
            await fetch("/api/auth/ensure-super-admin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: updates.dueno_email, nombre: updates.dueno_nombre, inscripcion_pagada: true }),
            });
          } catch (error) {
            console.error("[ConfigService] Error calling ensure-super-admin (new owner path)", error);
          }
        }
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
    const { data } = await this.supabase
      .from("gym_config_metodos_pago")
      .select("*")
      .eq("habilitado", true)
      .order("metodo_pago");

    return data || [];
  }

  async saveMetodosPago(metodos: MetodoPagoConfig[]): Promise<void> {
    const { data: existingRecords } = await this.supabase
      .from("gym_config_metodos_pago")
      .select("*")
      .eq("habilitado", true);

    const existingMap = new Map((existingRecords || []).map((r) => [r.metodo_pago, r]));

    for (const metodo of metodos) {
      const existing = existingMap.get(metodo.metodo_pago);

      if (metodo.habilitado) {
        if (existing) {
          if (existing.monto_mensual !== metodo.monto_mensual || existing.monto_inscripcion !== metodo.monto_inscripcion) {
            await this.supabase.rpc("actualizar_metodo_pago_atomico", {
              p_id: existing.id,
              p_monto_mensual: metodo.monto_mensual,
              p_monto_inscripcion: metodo.monto_inscripcion,
              p_habilitado: true,
            });
          }
        } else {
          await this.supabase.from("gym_config_metodos_pago").insert({
            metodo_pago: metodo.metodo_pago,
            monto_mensual: metodo.monto_mensual,
            monto_inscripcion: metodo.monto_inscripcion,
            habilitado: true,
          });
        }
      } else {
        if (existing) {
          await this.supabase
            .from("gym_config_metodos_pago")
            .delete()
            .eq("id", existing.id);
        }
      }
    }
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
