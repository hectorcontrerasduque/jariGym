import { createClient } from "@/lib/supabase/client";
import { getMonthName } from "@/lib/utils";
import { messages } from "@/lib/messages";
import type { Pago, MetodoPago, TipoPago } from "@/lib/types";

export interface CreatePagoInput {
  usuario_id: string;
  monto: number;
  mes_pagar: number;
  anio_pagar: number;
  metodo_pago: MetodoPago;
  tipo_pago: TipoPago;
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
    if (!user) throw new Error(messages.toast.noAutenticado);

    const pagoData: Record<string, unknown> = {
      ...input,
      estado: "pendiente",
    };

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
    if (!user) throw new Error(messages.toast.noAutenticado);

    const { data: profile } = await this.supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "super_admin" && profile?.role !== "admin") {
      throw new Error(messages.toast.noAutorizado);
    }

    const { data, error } = await this.supabase
      .rpc("aprobar_pago_atomico", { p_pago_id: pagoId, p_user_id: user.id });

    if (error) throw error;
    return data as Pago;
  }

  async rechazarPago(pagoId: string, notas?: string): Promise<Pago> {
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

    const { data, error } = await this.supabase
      .from("pagos")
      .update({
        estado: "rechazado",
        notas: notas || "Pago rechazado",
      })
      .eq("id", pagoId)
      .eq("estado", "pendiente")
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async eliminarPago(pagoId: string): Promise<void> {
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
      .from("pagos")
      .delete()
      .eq("id", pagoId)
      .eq("estado", "pendiente");

    if (error) throw error;
  }

  async listarMisPagos(anio?: number): Promise<Pago[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    let query = this.supabase
      .from("pagos")
      .select("*")
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false });

    if (anio) {
      query = query.eq("anio_pagar", anio);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async listarPagosUsuario(usuarioId: string, anio?: number): Promise<Pago[]> {
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

  async crearPagoAprobado(input: CreatePagoInput): Promise<Pago> {
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

    const pagoData: Record<string, unknown> = {
      ...input,
      estado: "aprobado",
      aprobado_por: user.id,
      fecha_pago_real: input.fecha_pago_real || new Date().toISOString(),
    };

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

  async listarPagos(estado?: string, anio?: number): Promise<Pago[]> {
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
    const anioActual = hoy.getFullYear();

    const mesesPendientes: { mes: number; anio: number }[] = [];

    for (let mes = 12; mes >= 1; mes--) {
      const yaPago = pagosAprobados.some(
        (p) => p.mes === mes && p.anio === anioActual
      );
      if (!yaPago) {
        mesesPendientes.push({ mes, anio: anioActual });
      }
    }

    return mesesPendientes.reverse();
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
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    const { data, error } = await this.supabase
      .from("pagos")
      .select("*, profile:profiles(nombre_completo, avatar_url)")
      .eq("estado", "aprobado")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      const fallback = await this.supabase
        .from("pagos")
        .select("*")
        .eq("estado", "aprobado")
        .order("created_at", { ascending: false })
        .limit(10);
      if (fallback.error) throw fallback.error;
      return fallback.data || [];
    }
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
        .select("id, inscripcion_pagada, fecha_inscripcion, activo")
        .eq("role", "miembro"),
      this.supabase
        .from("pagos")
        .select("monto, usuario_id, estado, anio_pagar, mes_pagar, notas")
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
        .select("monto_mensual, monto_inscripcion")
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
    const montoInscripcion = config?.data?.monto_inscripcion || 0;

    // Determine inscription status from pagos table (approved payments with "inscripción")
    const todosPagosAprobados = pagosAnioData.filter((p) => p.estado === "aprobado");
    const miembrosConInscripcionPagada = new Set<string>();
    for (const pago of todosPagosAprobados) {
      const isInscripcion = pago.notas?.toLowerCase().includes("inscripción") || pago.notas?.toLowerCase().includes("inscripcion");
      if (isInscripcion) {
        miembrosConInscripcionPagada.add(pago.usuario_id);
      }
    }

    // Also include profiles where inscripcion_pagada is true (for backwards compatibility)
    for (const m of miembros) {
      if (m.inscripcion_pagada) {
        miembrosConInscripcionPagada.add(m.id);
      }
    }

    // Inscritos: activos con inscripción pagada (por pagos o profile)
    const miembrosActivos = miembros.filter((m) => m.activo !== false);
    const inscritosPagados = miembrosActivos.filter((m) => miembrosConInscripcionPagada.has(m.id)).length;
    const inscritosPendientes = miembrosActivos.filter((m) => !miembrosConInscripcionPagada.has(m.id)).length;

    // Deudores: miembros activos (no libres) que deben inscripción o mensualidad
    const deudoresSet = new Set<string>();
    let deudoresInscripcion = 0;
    let deudoresMensualidad = 0;
    let montoDeudaInscripcion = 0;
    let montoDeudaMensualidad = 0;

    for (const m of miembrosActivos) {
      if (miembrosLibresIds.has(m.id)) continue;

      let owesInscripcion = false;
      let owesMensualidad = false;

      // Check inscription debt
      if (!miembrosConInscripcionPagada.has(m.id)) {
        owesInscripcion = true;
      }

      // Check monthly payment debt
      const pagosMiembro = todosPagosAprobados.filter((p) => p.usuario_id === m.id);

      if (anioConsulta === hoy.getFullYear()) {
        const mesesPagados = new Set(pagosMiembro.map((p) => p.mes_pagar));
        if (!mesesPagados.has(mesActual)) {
          owesMensualidad = true;
        }
      } else {
        const tienePagoEnAnio = pagosMiembro.some((p) => p.anio_pagar === anioConsulta);
        if (!tienePagoEnAnio) {
          owesMensualidad = true;
        }
      }

      if (owesInscripcion || owesMensualidad) {
        deudoresSet.add(m.id);
        if (owesInscripcion) {
          deudoresInscripcion++;
          montoDeudaInscripcion += montoInscripcion;
        }
        if (owesMensualidad) {
          deudoresMensualidad++;
          montoDeudaMensualidad += montoMensual;
        }
      }
    }

    const montoDeuda = montoDeudaInscripcion + montoDeudaMensualidad;

    // Al día: miembros con inscripción pagada que tienen pago aprobado en mes actual
    const pagosMesActual = pagosAnioData.filter(
      (p) => p.estado === "aprobado" && p.mes_pagar === mesActual && p.anio_pagar === anioConsulta
    );
    const usuariosAlDia = new Set(
      pagosMesActual.filter((p) => miembrosConInscripcionPagada.has(p.usuario_id)).map((p) => p.usuario_id)
    );
    const alDiaMensualidad = usuariosAlDia.size;
    const montoPagado = pagosMesActual
      .filter((p) => usuariosAlDia.has(p.usuario_id))
      .reduce((sum, p) => sum + (p.monto || 0), 0);

    return {
      totalMiembros: miembros.length,
      miembrosActivos: miembrosActivos.length,
      inscritosPagados,
      inscritosPendientes,
      deudoresTotal: deudoresSet.size,
      deudoresInscripcion,
      deudoresMensualidad,
      alDiaMensualidad,
      montoDeuda,
      montoDeudaInscripcion,
      montoDeudaMensualidad,
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
    const mesMaximo = anioConsulta === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;

    let config = null;
    try {
      const { data } = await this.supabase
        .from("gym_config_metodos_pago")
        .select("monto_mensual")
        .eq("habilitado", true)
        .limit(1)
        .maybeSingle();
      config = data;
    } catch {
      config = null;
    }
    const montoMensual = config?.monto_mensual || 5;

    const meses = [];
    for (let mes = 1; mes <= mesMaximo; mes++) {
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

        return { mes: m.mes, anio: m.anio, nombre: m.nombre, totalMiembrosMes, idsMes };
      })
    );

    const { data: allPagos } = await this.supabase
      .from("pagos")
      .select("usuario_id, estado, monto, mes_pagar, anio_pagar")
      .eq("anio_pagar", anioConsulta)
      .in("estado", ["aprobado", "pendiente"]);

    const pagosAll = allPagos || [];

    const mesesFinal = statsMeses.map((m) => {
      const pagosMes = pagosAll.filter((p) => p.mes_pagar === m.mes && p.anio_pagar === m.anio);

      const pagados = new Set(
        pagosMes.filter((p) => p.estado === "aprobado" && m.idsMes.has(p.usuario_id)).map((p) => p.usuario_id)
      ).size;

      const montoAcumulado = pagosMes
        .filter((p) => p.estado === "aprobado" && m.idsMes.has(p.usuario_id))
        .reduce((sum, p) => sum + (p.monto || 0), 0);

      const libresMes = profiles.filter((p) => m.idsMes.has(p.id) && libresIds.has(p.id)).length;

      const sinPago = Math.max(0, m.totalMiembrosMes - pagados - libresMes);
      const montoAdeudado = sinPago * montoMensual;

      return {
        mes: m.mes,
        anio: m.anio,
        nombre: m.nombre,
        pagados,
        pendientes: 0,
        sinPago,
        libres: libresMes,
        montoAcumulado,
        montoAdeudado,
      };
    });

    return { totalMiembros: profiles.length, libres: libresCount, meses: mesesFinal };
  }
}

export const pagosService = new PagosService();
