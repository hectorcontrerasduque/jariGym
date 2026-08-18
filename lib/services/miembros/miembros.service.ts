import { createClient } from "@/lib/supabase/client";
import type { Profile, Membresia } from "@/lib/types";

export class MiembrosService {
  private supabase = createClient();

  async listarMiembros(): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .order("nombre_completo", { ascending: true });

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
    const { data, error } = await this.supabase
      .from("profiles")
      .update(updates)
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
    const { data: existing } = await this.supabase
      .from("membresias")
      .select("id, fecha_fin")
      .eq("usuario_id", usuarioId)
      .is("fecha_fin", null)
      .limit(1)
      .maybeSingle();

    if (existing) {
      await this.supabase
        .from("membresias")
        .update({ fecha_fin: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await this.supabase
        .from("membresias")
        .insert({
          usuario_id: usuarioId,
          fecha_inicio: new Date().toISOString(),
          fecha_fin: null,
          estado: "activa",
          asignado_por: asignadoPor,
          asignado_por_nombre: asignadoPorNombre,
        });
    }
  }

  async actualizarEstado(usuarioId: string, activo: boolean): Promise<void> {
    const { error } = await this.supabase
      .from("profiles")
      .update({ activo })
      .eq("id", usuarioId);

    if (error) throw error;
  }
}

export const miembrosService = new MiembrosService();
