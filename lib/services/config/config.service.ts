import { createClient } from "@/lib/supabase/client";
import { messages } from "@/lib/messages";
import type { GymConfig, MetodoPago, PaymentMethod } from "@/lib/types";

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
    if (profile?.role !== "super_admin") {
      throw new Error(messages.toast.noAutorizado);
    }

    const { data: existing } = await this.supabase
      .from("gym_config")
      .select("id, owner_email")
      .limit(1)
      .single();

    if (updates.owner_email) {
      if (existing && updates.owner_email !== existing.owner_email) {
        const { data: newOwnerProfile } = await this.supabase
          .from("profiles")
          .select("id, activo, role")
          .eq("email", updates.owner_email)
          .maybeSingle();

        if (newOwnerProfile && newOwnerProfile.activo !== false && newOwnerProfile.role !== "super_admin") {
          throw new Error(messages.notificaciones.emailYaRegistradoActivo);
        }

        if (existing.owner_email) {
          const { data: oldOwnerProfile } = await this.supabase
            .from("profiles")
            .select("id")
            .eq("email", existing.owner_email)
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
              body: JSON.stringify({ email: updates.owner_email, nombre: updates.owner_name, inscription_paid: true }),
            });
          } catch (error) {
            console.error("[config] Error creando super_admin via ensure-super-admin:", error);
          }
        }
      } else if (!existing) {
        const { data: existingProfile } = await this.supabase
          .from("profiles")
          .select("id, activo, role")
          .eq("email", updates.owner_email)
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
              body: JSON.stringify({ email: updates.owner_email, nombre: updates.owner_name, inscription_paid: true }),
            });
          } catch (error) {
            console.error("[config] Error creando super_admin via ensure-super-admin:", error);
          }
        }
      }
    }

    const { id, created_at, updated_at, created_by, updated_by, ...safeUpdates } = updates as GymConfig; // eslint-disable-line @typescript-eslint/no-unused-vars

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

  async getMetodosPago(): Promise<PaymentMethod[]> {
    const { data } = await this.supabase
      .from("gym_config_payment_methods")
      .select("*")
      .eq("is_active", true)
      .order("payment_method");

    return data || [];
  }

  async saveMetodosPago(metodos: PaymentMethod[]): Promise<void> {
    const { data: existingRecords } = await this.supabase
      .from("gym_config_payment_methods")
      .select("*")
      .eq("is_active", true);

    const existingMap = new Map((existingRecords || []).map((r) => [r.payment_method, r]));

    for (const metodo of metodos) {
      const existing = existingMap.get(metodo.payment_method);

      if (metodo.is_active) {
        if (existing) {
          if (existing.amount_monthly !== metodo.amount_monthly || existing.amount_inscription !== metodo.amount_inscription) {
            await this.supabase
              .from("gym_config_payment_methods")
              .update({
                amount_monthly: metodo.amount_monthly,
                amount_inscription: metodo.amount_inscription,
                effective_from: metodo.effective_from || new Date().toISOString().split("T")[0],
              })
              .eq("id", existing.id);
          }
        } else {
          await this.supabase.from("gym_config_payment_methods").insert({
            payment_method: metodo.payment_method,
            amount_monthly: metodo.amount_monthly,
            amount_inscription: metodo.amount_inscription,
            is_active: true,
            effective_from: new Date().toISOString().split("T")[0],
          });
        }
      } else {
        if (existing) {
          await this.supabase
            .from("gym_config_payment_methods")
            .update({ is_active: false, effective_to: new Date().toISOString().split("T")[0] })
            .eq("id", existing.id);
        }
      }
    }
  }

  async getMetodoPago(metodo: MetodoPago): Promise<PaymentMethod | null> {
    const { data, error } = await this.supabase
      .from("gym_config_payment_methods")
      .select("*")
      .eq("payment_method", metodo)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  }
}

export const configService = new ConfigService();
