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

    const emailChanged = updates.owner_email && (
      !existing || updates.owner_email !== existing.owner_email
    );

    if (emailChanged && updates.owner_name && updates.owner_email) {
      const { data: profileByEmail } = await this.supabase
        .from("profiles")
        .select("id, activo, role")
        .eq("email", updates.owner_email)
        .maybeSingle();

      // Si ya existe un profile activo con otro rol, no sobreescribir
      if (profileByEmail && profileByEmail.activo === true && profileByEmail.role !== "super_admin") {
        throw new Error(messages.notificaciones.emailYaRegistradoActivo);
      }

      // Desactivar owner anterior
      if (existing?.owner_email) {
        const { data: oldProfile } = await this.supabase
          .from("profiles")
          .select("id")
          .eq("email", existing.owner_email)
          .maybeSingle();
        if (oldProfile) {
          await this.supabase
            .from("profiles")
            .update({ activo: false })
            .eq("id", oldProfile.id);
        }
      }

      // Unificar: siempre llamar a ensure-super-admin para crear O promover + sync auth.users
      const { data: { session } } = await this.supabase.auth.getSession();
      try {
        const res = await fetch("/api/auth/ensure-super-admin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            email: updates.owner_email,
            nombre: updates.owner_name,
            inscription_paid: true,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Error creando profile del propietario");
        }
      } catch (error) {
        throw error;
      }
    } else if (emailChanged && (!updates.owner_name || !updates.owner_email)) {
      throw new Error(messages.configuracion.ownerRequired);
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
      .select("*");

    const existingMap = new Map((existingRecords || []).map((r) => [r.payment_method, r]));
    const activeMetodo = metodos.find((m) => m.is_active);

    // Desactivar todos los registros existentes primero
    for (const existing of existingRecords || []) {
      if (existing.is_active) {
        await this.supabase
          .from("gym_config_payment_methods")
          .update({ is_active: false, effective_to: new Date().toISOString().split("T")[0] })
          .eq("id", existing.id);
      }
    }

    if (!activeMetodo) return;

    const existing = existingMap.get(activeMetodo.payment_method);

    if (existing) {
      // Siempre INSERT nueva fila (versionado temporal)
      await this.supabase.from("gym_config_payment_methods").insert({
        payment_method: activeMetodo.payment_method,
        amount_monthly: activeMetodo.amount_monthly,
        amount_inscription: activeMetodo.amount_inscription,
        is_active: true,
        effective_from: new Date().toISOString().split("T")[0],
      });
    } else {
      await this.supabase.from("gym_config_payment_methods").insert({
        payment_method: activeMetodo.payment_method,
        amount_monthly: activeMetodo.amount_monthly,
        amount_inscription: activeMetodo.amount_inscription,
        is_active: true,
        effective_from: new Date().toISOString().split("T")[0],
      });
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
