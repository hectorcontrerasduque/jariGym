import { createClient } from "@/lib/supabase/client";
import { messages } from "@/lib/messages";
import type { Profile, Membership } from "@/lib/types";

export class MiembrosService {
  private supabase = createClient();

  async listarMiembros(): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, activo, role, start_date, inscription_admin_note, inscription_paid, arrival_time, departure_time")
      .order("start_date", { ascending: false });

    if (error) throw error;
    return (data || []) as Profile[];
  }

  async buscarMiembros(busqueda: string): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .or(`full_name.ilike.%${busqueda}%,email.ilike.%${busqueda}%`)
      .order("full_name", { ascending: true })
      .limit(10);

    if (error) throw error;
    return data || [];
  }

  async obtenerMiembro(id: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  async actualizarMiembro(id: string, updates: Partial<Profile>): Promise<Profile> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    const allowedFields: Record<string, unknown> = {};
    const allowedKeys = ["full_name", "email", "phone_number", "document_id", "activo", "inscription_admin_note", "inscription_paid", "inscription_date", "inscription_amount_paid", "membresia_libre"];
    for (const key of allowedKeys) {
      if (key in updates) {
        // eslint-disable-next-line security/detect-object-injection
        allowedFields[key] = (updates as Record<string, unknown>)[key];
      }
    }

    const { data, error } = await this.supabase
      .from("profiles")
      .update(allowedFields)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async crearMiembroPorEmail(email: string, nombre: string): Promise<Profile> {
    const res = await fetch("/api/miembros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nombre }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al crear miembro");
    return data.miembro;
  }

  async obtenerMembresia(userId: string): Promise<Membership | null> {
    const { data } = await this.supabase
      .from("memberships")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "activa")
      .single();

    return data;
  }

  async stats() {
    const [total, libre] = await Promise.all([
      this.supabase
        .from("profiles")
        .select("id", { count: "exact", head: true }),
      this.supabase
        .from("memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("status", "activa")
        .is("end_date", null),
    ]);

    return {
      totalMiembros: total.count || 0,
      membresiaLibre: libre.count || 0,
    };
  }

  async activarMembresia(userId: string, assignedBy: string): Promise<void> {
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

    const hoy = new Date().toISOString().split("T")[0];

    // Cancelar membresía activa anterior si existe
    const { data: oldMembership } = await this.supabase
      .from("memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "activa")
      .maybeSingle();

    if (oldMembership) {
      const { error } = await this.supabase
        .from("memberships")
        .update({ status: "cancelada", end_date: hoy })
        .eq("id", oldMembership.id);
      if (error) throw error;
    }

    // Crear nueva membresía perpetua activa
    const { error } = await this.supabase
      .from("memberships")
      .insert({
        user_id: userId,
        status: "activa",
        start_date: hoy,
        end_date: null,
        assigned_by: assignedBy,
      });
    if (error) throw error;
  }

  async desactivarMembresia(userId: string): Promise<void> {
    const hoy = new Date().toISOString().split("T")[0];
    const { error } = await this.supabase
      .from("memberships")
      .update({ status: "cancelada", end_date: hoy })
      .eq("user_id", userId)
      .eq("status", "activa");
    if (error) throw error;
  }

  async obtenerHistorialMembresias(userId: string): Promise<Membership[]> {
    const { data, error } = await this.supabase
      .from("memberships")
      .select("*, profiles!assigned_by(full_name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []) as Membership[];
  }
}

export const miembrosService = new MiembrosService();
