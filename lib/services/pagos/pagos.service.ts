import { createClient } from "@/lib/supabase/client";
import type { Pago, MetodoPago } from "@/lib/types";

export interface CreatePagoInput {
  usuario_id: string;
  monto: number;
  mes_pagar: number;
  anio_pagar: number;
  metodo_pago: MetodoPago;
  comprobante_url?: string;
  codigo_billete?: string;
  notas?: string;
}

export class PagosService {
  private supabase = createClient();

  async crearPago(input: CreatePagoInput): Promise<Pago> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    const { data: profile } = await this.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    const pagoData: Record<string, unknown> = {
      ...input,
      tenant_id: profile?.tenant_id,
      estado: "pendiente",
    };

    if (input.metodo_pago === "membresia_libre") {
      pagoData.monto = 0;
      pagoData.comprobante_url = null;
      pagoData.codigo_billete = null;
    }

    if (input.metodo_pago === "efectivo") {
      pagoData.comprobante_url = null;
    }

    const { data, error } = await this.supabase
      .from("pagos")
      .insert(pagoData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async aprobarPago(pagoId: string): Promise<Pago> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    const { data, error } = await this.supabase
      .from("pagos")
      .update({
        estado: "aprobado",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        fecha_pago_real: new Date().toISOString(),
      })
      .eq("id", pagoId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async rechazarPago(pagoId: string, notas?: string): Promise<Pago> {
    const { data, error } = await this.supabase
      .from("pagos")
      .update({
        estado: "rechazado",
        notas: notas || "Pago rechazado",
      })
      .eq("id", pagoId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async listarMisPagos(usuarioId: string, anio?: number): Promise<Pago[]> {
    let query = this.supabase
      .from("pagos")
      .select("*")
      .eq("usuario_id", usuarioId)
      .order("created_at", { ascending: false });

    if (anio) {
      query = query.eq("anio_pagar", anio);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async listarPagos(estado?: string, anio?: number): Promise<Pago[]> {
    let query = this.supabase
      .from("pagos")
      .select("*, profile:profiles(nombre_completo, avatar_url, email)")
      .order("created_at", { ascending: false });

    if (estado) {
      query = query.eq("estado", estado);
    }
    if (anio) {
      query = query.eq("anio_pagar", anio);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async pagosPendientes(): Promise<Pago[]> {
    return this.listarPagos("pendiente");
  }

  async mesesPendientes(usuarioId: string): Promise<{ mes: number; anio: number }[]> {
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("fecha_inscripcion, inscripcion_pagada")
      .eq("id", usuarioId)
      .single();

    const fechaInscripcion = profile?.fecha_inscripcion
      ? new Date(profile.fecha_inscripcion)
      : new Date();

    const { data, error } = await this.supabase
      .from("pagos")
      .select("mes_pagar, anio_pagar")
      .eq("usuario_id", usuarioId)
      .eq("estado", "aprobado")
      .order("anio_pagar", { ascending: false })
      .order("mes_pagar", { ascending: false });

    if (error) throw error;

    const pagosAprobados = (data || []).map((p) => ({
      mes: p.mes_pagar,
      anio: p.anio_pagar,
    }));

    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();

    const mesMinInscripcion = fechaInscripcion.getMonth() + 1;
    const anioMinInscripcion = fechaInscripcion.getFullYear();

    const mesesPendientes: { mes: number; anio: number }[] = [];

    for (let anio = anioActual; anio >= anioMinInscripcion; anio--) {
      const mesMax = anio === anioActual ? mesActual : 12;
      const mesMin = anio === anioMinInscripcion ? mesMinInscripcion : 1;

      for (let mes = mesMax; mes >= mesMin; mes--) {
        const yaPago = pagosAprobados.some(
          (p) => p.mes === mes && p.anio === anio
        );
        if (!yaPago) {
          mesesPendientes.push({ mes, anio });
        }
      }
    }

    return mesesPendientes;
  }

  async mesesPendientesAdmin(usuarioId: string): Promise<{ mes: number; anio: number }[]> {
    return this.mesesPendientes(usuarioId);
  }

  async aniosConPagos(): Promise<number[]> {
    const { data, error } = await this.supabase
      .from("pagos")
      .select("anio_pagar")
      .order("anio_pagar", { ascending: false });

    if (error) throw error;

    const anios = [...new Set((data || []).map((p) => p.anio_pagar))];
    if (!anios.includes(new Date().getFullYear())) {
      anios.push(new Date().getFullYear());
    }
    return anios.sort((a, b) => b - a);
  }

  async stats(anio?: number) {
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();

    const [pendientes, aprobados, allMiembros, pagosAnio] = await Promise.all([
      this.supabase
        .from("pagos")
        .select("id, monto, usuario_id, mes_pagar, anio_pagar", { count: "exact", head: true })
        .eq("estado", "pendiente")
        .eq("anio_pagar", anioConsulta),
      this.supabase
        .from("pagos")
        .select("monto, usuario_id")
        .eq("estado", "aprobado")
        .eq("anio_pagar", anioConsulta),
      this.supabase
        .from("profiles")
        .select("id, inscripcion_pagada, membresia_libre, estado, fecha_inscripcion")
        .eq("role", "miembro"),
      this.supabase
        .from("pagos")
        .select("monto, usuario_id, estado, anio_pagar, mes_pagar")
        .eq("anio_pagar", anioConsulta),
    ]);

    const miembros = allMiembros.data || [];
    const pagosAprobados = aprobados.data || [];
    const pagosAnioData = pagosAnio.data || [];

    const miembrosActivos = miembros.filter((m) => m.estado === "activo");
    const miembrosLibres = miembros.filter((m) => m.membresia_libre);

    const inscritosPagados = miembros.filter((m) => m.inscripcion_pagada).length;
    const inscritosPendientes = miembros.filter((m) => !m.inscripcion_pagada).length;

    const usuariosConPagoMesActual = new Set(
      pagosAprobados
        .filter((p) => {
          const hoy = new Date();
          return true;
        })
        .map((p) => p.usuario_id)
    );

    const usuariosConPago = new Set(pagosAprobados.map((p) => p.usuario_id));
    const deudoresMensualidad = miembrosActivos.filter(
      (m) => !usuariosConPago.has(m.id) && !m.membresia_libre
    ).length;
    const alDiaMensualidad = miembrosActivos.filter(
      (m) => usuariosConPago.has(m.id) || m.membresia_libre
    ).length;

    const montoDeuda = deudoresMensualidad * 0;
    const montoPagado = pagosAprobados.reduce((sum, p) => sum + (p.monto || 0), 0);

    const ingresosMes = pagosAprobados
      .filter((p) => true)
      .reduce((sum, p) => sum + (p.monto || 0), 0);

    return {
      totalMiembros: miembros.length,
      inscritosPagados,
      inscritosPendientes,
      deudoresMensualidad,
      alDiaMensualidad,
      montoDeuda,
      montoPagado,
      membresiaLibre: miembrosLibres.length,
      pagosConfirmados: pagosAprobados.length,
      pagosPendientes: pendientes.count || 0,
      ingresosMes,
    };
  }
}

export const pagosService = new PagosService();
