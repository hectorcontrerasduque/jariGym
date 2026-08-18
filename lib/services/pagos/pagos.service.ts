import { createClient } from "@/lib/supabase/client";
import { getMonthName } from "@/lib/utils";
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
  fecha_pago_real?: string;
}

export class PagosService {
  private supabase = createClient();

  async crearPago(input: CreatePagoInput): Promise<Pago> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    const pagoData: Record<string, unknown> = {
      ...input,
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

    if (input.fecha_pago_real) {
      pagoData.fecha_pago_real = input.fecha_pago_real;
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

  async eliminarPago(pagoId: string): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    const { error } = await this.supabase
      .from("pagos")
      .delete()
      .eq("id", pagoId)
      .eq("estado", "pendiente");

    if (error) throw error;
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
    if (error) {
      const fallback = await this.supabase
        .from("pagos")
        .select("*")
        .order("created_at", { ascending: false });
      if (fallback.error) throw fallback.error;
      return fallback.data || [];
    }
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
      .select("mes_pagar, anio_pagar, estado")
      .eq("usuario_id", usuarioId)
      .in("estado", ["aprobado", "pendiente"])
      .order("anio_pagar", { ascending: false })
      .order("mes_pagar", { ascending: false });

    if (error) return [];

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

  async tieneInscripcionPendiente(usuarioId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from("pagos")
      .select("id")
      .eq("usuario_id", usuarioId)
      .ilike("notas", "%inscripción%")
      .in("estado", ["pendiente", "aprobado"])
      .limit(1)
      .maybeSingle();

    return !!data;
  }

  async pagosRecientesAprobados(): Promise<Pago[]> {
    const { data, error } = await this.supabase
      .from("pagos")
      .select("*, profile:profiles(nombre_completo, avatar_url)")
      .eq("estado", "aprobado")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;
    return data || [];
  }

  async aniosConPagos(usuarioId?: string): Promise<number[]> {
    let query = this.supabase
      .from("pagos")
      .select("anio_pagar")
      .order("anio_pagar", { ascending: false });

    if (usuarioId) {
      query = query.eq("usuario_id", usuarioId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const anios = Array.from(new Set((data || []).map((p) => p.anio_pagar)));
    if (!anios.includes(new Date().getFullYear())) {
      anios.push(new Date().getFullYear());
    }
    return anios.sort((a, b) => b - a);
  }

  async stats(anio?: number) {
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();
    const mesActual = hoy.getMonth() + 1;

    const [pendientes, allMiembros, pagosAnio, libres] = await Promise.all([
      this.supabase
        .from("pagos")
        .select("id, monto, usuario_id, mes_pagar, anio_pagar", { count: "exact", head: true })
        .eq("estado", "pendiente")
        .eq("anio_pagar", anioConsulta),
      this.supabase
        .from("profiles")
        .select("id, inscripcion_pagada, fecha_inscripcion")
        .eq("role", "miembro")
        .or("activo.is.true,activo.is.null"),
      this.supabase
        .from("pagos")
        .select("monto, usuario_id, estado, anio_pagar, mes_pagar")
        .eq("anio_pagar", anioConsulta),
      this.supabase
        .from("membresias")
        .select("usuario_id")
        .is("fecha_fin", null),
    ]);

    let config = null;
    try {
      const { data } = await this.supabase
        .from("gym_config_metodos_pago")
        .select("monto_mensual")
        .eq("habilitado", true)
        .limit(1)
        .maybeSingle();
      config = { data };
    } catch {
      config = { data: null };
    }

    const miembros = allMiembros.data || [];
    const pagosAnioData = pagosAnio.data || [];
    const miembrosLibresIds = new Set((libres.data || []).map((l) => l.usuario_id));
    const montoMensual = config?.data?.monto_mensual || 5;

    // Inscritos: solo miembros activos
    const inscritosPagados = miembros.filter((m) => m.inscripcion_pagada).length;
    const inscritosPendientes = miembros.filter((m) => !m.inscripcion_pagada).length;

    // Deudores: meses no pagados por miembros activos (no libres)
    const todosPagosAprobados = pagosAnioData.filter((p) => p.estado === "aprobado");
    let totalMesesDeuda = 0;
    const deudoresSet = new Set<string>();

    for (const m of miembros) {
      if (miembrosLibresIds.has(m.id)) continue;
      if (!m.inscripcion_pagada) continue;

      const fechaInicio = m.fecha_inscripcion ? new Date(m.fecha_inscripcion) : new Date(anioConsulta, 0, 1);
      const mesInicio = fechaInicio.getFullYear() === anioConsulta ? fechaInicio.getMonth() + 1 : 1;
      const mesMax = anioConsulta < hoy.getFullYear() ? 12 : (anioConsulta === hoy.getFullYear() ? mesActual : 12);

      const pagosMiembro = todosPagosAprobados.filter((p) => p.usuario_id === m.id);
      const mesesPagados = new Set(pagosMiembro.map((p) => p.mes_pagar));

      let mesesDeudaMiembro = 0;
      for (let mes = mesInicio; mes <= mesMax; mes++) {
        if (!mesesPagados.has(mes)) {
          mesesDeudaMiembro++;
        }
      }
      if (mesesDeudaMiembro > 0) {
        deudoresSet.add(m.id);
        totalMesesDeuda += mesesDeudaMiembro;
      }
    }

    const montoDeuda = totalMesesDeuda * montoMensual;

    // Al día: pagos aceptados en mes actual (solo de miembros con inscripción pagada)
    const pagosMesActual = pagosAnioData.filter(
      (p) => p.estado === "aprobado" && p.mes_pagar === mesActual && p.anio_pagar === anioConsulta
    );
    const miembrosConInscripcion = new Set(
      miembros.filter((m) => m.inscripcion_pagada).map((m) => m.id)
    );
    const alDiaMensualidad = pagosMesActual.filter((p) => miembrosConInscripcion.has(p.usuario_id)).length;
    const montoPagado = pagosMesActual
      .filter((p) => miembrosConInscripcion.has(p.usuario_id))
      .reduce((sum, p) => sum + (p.monto || 0), 0);

    return {
      totalMiembros: miembros.length,
      inscritosPagados,
      inscritosPendientes,
      deudoresMensualidad: deudoresSet.size,
      alDiaMensualidad,
      montoDeuda,
      montoPagado,
      membresiaLibre: miembrosLibresIds.size,
      pagosConfirmados: todosPagosAprobados.length,
      pagosPendientes: pendientes.count || 0,
      ingresosMes: montoPagado,
    };
  }

  async monthlyStats(anio?: number) {
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();

    const meses = [];
    for (let mes = 1; mes <= 12; mes++) {
      meses.push({
        mes,
        anio: anioConsulta,
        nombre: getMonthName(mes),
      });
    }

    const { data: allProfiles } = await this.supabase
      .from("profiles")
      .select("id, fecha_inscripcion, role")
      .eq("role", "miembro");

    const profiles = allProfiles || [];

    const { data: libreData } = await this.supabase
      .from("membresias")
      .select("usuario_id")
      .is("fecha_fin", null);

    const libresIds = new Set((libreData || []).map((l) => l.usuario_id));
    const libresCount = libresIds.size;

    const statsMeses = await Promise.all(
      meses.map(async (m) => {
        const fechaMes = new Date(m.anio, m.mes - 1, 1);
        const finMes = new Date(m.anio, m.mes, 0);

        const miembrosMes = profiles.filter((p) => {
          const fechaInsc = p.fecha_inscripcion ? new Date(p.fecha_inscripcion) : null;
          if (fechaInsc && fechaInsc > finMes) return false;
          return true;
        });

        const totalMiembrosMes = miembrosMes.length;
        const idsMes = new Set(miembrosMes.map((p) => p.id));

        const { data: pagosMes } = await this.supabase
          .from("pagos")
          .select("usuario_id, estado")
          .eq("mes_pagar", m.mes)
          .eq("anio_pagar", m.anio);

        const pagados = new Set(
          (pagosMes || []).filter((p) => p.estado === "aprobado" && idsMes.has(p.usuario_id)).map((p) => p.usuario_id)
        ).size;

        const libresMes = miembrosMes.filter((p) => libresIds.has(p.id)).length;

        const sinPago = Math.max(0, totalMiembrosMes - pagados - libresMes);

        return {
          mes: m.mes,
          anio: m.anio,
          nombre: m.nombre,
          pagados,
          pendientes: 0,
          sinPago,
          libres: libresMes,
        };
      })
    );

    return { totalMiembros: profiles.length, libres: libresCount, meses: statsMeses };
  }
}

export const pagosService = new PagosService();
