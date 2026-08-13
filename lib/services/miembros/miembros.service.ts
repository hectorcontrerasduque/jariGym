import { createClient } from "@/lib/supabase/client";
import type { Profile, Membresia } from "@/lib/types";

export class MiembrosService {
  private supabase = createClient();

  async listarMiembros(estado?: string): Promise<Profile[]> {
    let query = this.supabase
      .from("profiles")
      .select("*")
      .order("nombre_completo", { ascending: true });

    if (estado) {
      query = query.eq("estado", estado);
    }

    const { data, error } = await query;
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

  async cambiarEstado(
    id: string,
    estado: "activo" | "suspendido" | "inactivo",
    notas_estado?: string
  ): Promise<Profile> {
    return this.actualizarMiembro(id, { estado, notas_estado });
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
      .select("*, plan:planes(*)")
      .eq("usuario_id", usuarioId)
      .eq("estado", "activa")
      .single();

    return data;
  }

  async stats() {
    const baseQuery = this.supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    const [total, activos, suspendidos, inactivos, libre] = await Promise.all([
      baseQuery,
      this.supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("estado", "activo"),
      this.supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("estado", "suspendido"),
      this.supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("estado", "inactivo"),
      this.supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("membresia_libre", true),
    ]);

    return {
      totalMiembros: total.count || 0,
      activos: activos.count || 0,
      suspendidos: suspendidos.count || 0,
      inactivos: inactivos.count || 0,
      membresiaLibre: libre.count || 0,
    };
  }
}

export const miembrosService = new MiembrosService();
