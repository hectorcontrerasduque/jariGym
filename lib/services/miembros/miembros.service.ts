import { createClient } from "@/lib/supabase/client";
import { messages } from "@/lib/messages";
import type { Profile, Membresia } from "@/lib/types";

export class MiembrosService {
  private supabase = createClient();

  async listarMiembros(): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .order("fecha_inscripcion", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async buscarMiembros(busqueda: string): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .or(`nombre_completo.ilike.%${busqueda}%,email.ilike.%${busqueda}%`)
      .order("nombre_completo", { ascending: true })
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
    const allowedKeys = ["nombre_completo", "email", "whatsapp", "cedula", "horario_entreno", "activo", "notas_admin", "inscripcion_pagada", "inscripcion_fecha", "monto_inscripcion_pagado", "membresia_libre"];
    for (const key of allowedKeys) {
      if (key in updates) {
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

  async obtenerMembresia(usuarioId: string): Promise<Membresia | null> {
    const { data } = await this.supabase
      .from("membresias")
      .select("*")
      .eq("usuario_id", usuarioId)
      .eq("estado", "activa")
      .single();

    return data;
  }

  async stats() {
    const [total, libre] = await Promise.all([
      this.supabase
        .from("profiles")
        .select("id", { count: "exact", head: true }),
      this.supabase
        .from("membresias")
        .select("usuario_id", { count: "exact", head: true })
        .is("fecha_fin", null),
    ]);

    return {
      totalMiembros: total.count || 0,
      membresiaLibre: libre.count || 0,
    };
  }

  async toggleMembresiaLibre(usuarioId: string, asignadoPor: string, asignadoPorNombre: string): Promise<void> {
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

    const { error } = await this.supabase
      .rpc("toggle_membresia_libre", {
        p_usuario_id: usuarioId,
        p_asignado_por: asignadoPor,
        p_asignado_por_nombre: asignadoPorNombre,
      });

    if (error) throw error;
  }

  async actualizarEstado(usuarioId: string, activo: boolean): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    const { data: profile } = await this.supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "super_admin" && profile?.role !== "admin") {
      throw new Error(messages.toast.noAutorizado);
    }

    const { error } = await this.supabase
      .rpc("actualizar_estado_miembro", {
        p_usuario_id: usuarioId,
        p_activo: activo,
        p_changed_by: user?.id || null,
      });

    if (error) throw error;
  }

  async obtenerEstadoActual(usuarioId: string): Promise<{ estado: string; changed_by: string | null; notas: string | null; fecha_evidencia: string } | null> {
    const { data, error } = await this.supabase
      .from("member_states")
      .select("estado, changed_by, notas, fecha_evidencia")
      .eq("usuario_id", usuarioId)
      .order("fecha_evidencia", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  }
}

export const miembrosService = new MiembrosService();
