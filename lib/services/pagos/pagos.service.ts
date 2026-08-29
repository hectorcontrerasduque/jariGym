import { createClient } from "@/lib/supabase/client";
import { getMonthName, getDiaCobro } from "@/lib/utils";
import { messages } from "@/lib/messages";
import type { Pago, MetodoPago, TipoPago, Profile, DetallePago } from "@/lib/types";

/**
 * PagosService - Service for payment operations.
 * 
 * IMPORTANT: This service creates a browser client (createClient()) at module level.
 * When called from Server Components / API Routes, you MUST pass a service_role client
 * as the optional `supabaseClient` parameter to all read methods.
 * 
 * Example:
 *   const supabase = createServiceClient(url, serviceKey);
 *   await pagosService.getMiembrosMorosos(year, supabase);
 *   await pagosService.stats(year, supabase);
 * 
 * Otherwise RLS will block queries (runs as anonymous anon key).
 */
export interface DetallePagoInput {
  mes: number | null;
  anio: number | null;
  tipo_pago: TipoPago;
  monto: number;
}

export interface CreatePagoInput {
  usuario_id: string;
  metodo_pago: MetodoPago;
  comprobante_url?: string;
  codigo_billete?: string;
  notas?: string;
  detalles: DetallePagoInput[];
}

export class PagosService {
  private supabase = createClient();

  async crearPago(input: CreatePagoInput): Promise<Pago> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    const comprobanteUrl = input.metodo_pago === "efectivo" ? null : (input.comprobante_url || null);

    const { data: pago, error: pagoError } = await this.supabase
      .from("pagos")
      .insert({
        usuario_id: input.usuario_id,
        estado: "pendiente",
        metodo_pago: input.metodo_pago,
        codigo_billete: input.codigo_billete || null,
        comprobante_url: comprobanteUrl,
        notas: input.notas || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (pagoError) {
      if (pagoError.message?.includes("row-level security")) {
        throw new Error("No tienes permiso para registrar este pago");
      }
      throw new Error(messages.toast.pagoError);
    }

    const detalles = input.detalles.map((d) => ({
      pago_id: pago.id,
      mes: d.mes,
      anio: d.anio,
      tipo_pago: d.tipo_pago,
      monto: d.monto,
    }));

    const { error: detalleError } = await this.supabase
      .from("detalle_pago")
      .insert(detalles);

    if (detalleError) {
      await this.supabase.from("pagos").delete().eq("id", pago.id);
      throw new Error(messages.toast.pagoError);
    }

    return { ...pago, detalle: detalles as DetallePago[] };
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
    if (profile?.role !== "super_admin") {
      throw new Error(messages.toast.noAutorizado);
    }

    const { data: pagoActual } = await this.supabase
      .from("pagos")
      .select("estado")
      .eq("id", pagoId)
      .single();

    const nuevoEstado = pagoActual?.estado === "suspendido" ? "suspendido" : "aprobado";

    const { data, error } = await this.supabase
      .from("pagos")
      .update({
        estado: nuevoEstado,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", pagoId)
      .select()
      .single();

    if (error) throw error;

    const { data: detalles } = await this.supabase
      .from("detalle_pago")
      .select("tipo_pago")
      .eq("pago_id", pagoId);

    const tieneInscripcion = detalles?.some((d) => d.tipo_pago === "inscripcion");
    if (tieneInscripcion) {
      await this.supabase
        .from("profiles")
        .update({
          inscripcion_pagada: true,
          inscripcion_fecha: new Date().toISOString().split("T")[0],
        })
        .eq("id", data.usuario_id);
    }

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
    if (profile?.role !== "super_admin") {
      throw new Error(messages.toast.noAutorizado);
    }

    const { data, error } = await this.supabase
      .from("pagos")
      .update({
        estado: "rechazado",
        notas: notas || "Pago rechazado",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
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
    const isAdmin = profile?.role === "super_admin";

    const query = this.supabase.from("pagos").delete().eq("id", pagoId);

    if (isAdmin) {
      query.eq("estado", "pendiente");
    } else {
      query.eq("usuario_id", user.id).eq("estado", "pendiente");
    }

    const { error } = await query;
    if (error) throw error;
  }

  async listarMisPagos(anio?: number, mes?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<Pago[]> {
    const supabase = supabaseClient || this.supabase;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    let query = supabase
      .from("pagos")
      .select("*, detalle:detalle_pago(*), profile:profiles!pagos_usuario_id_fkey(nombre_completo, avatar_url, email)")
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false });

    if (anio || mes) {
      const { data: detalleMatches } = await supabase
        .from("detalle_pago")
        .select("pago_id")
        .eq("anio", anio || new Date().getFullYear())
        .eq("mes", mes || 0);

      if (mes && detalleMatches && detalleMatches.length > 0) {
        const pagoIds = Array.from(new Set(detalleMatches.map((d) => d.pago_id)));
        query = query.in("id", pagoIds);
      } else if (anio && !mes) {
        const { data: detalleAnio } = await supabase
          .from("detalle_pago")
          .select("pago_id")
          .eq("anio", anio);
        const pagoIds = Array.from(new Set((detalleAnio || []).map((d) => d.pago_id)));
        if (pagoIds.length > 0) {
          query = query.in("id", pagoIds);
        } else {
          return [];
        }
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async listarPagosUsuario(usuarioId: string, anio?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<Pago[]> {
    const supabase = supabaseClient || this.supabase;
    let query = supabase
      .from("pagos")
      .select("*, detalle:detalle_pago(*), profile:profiles!pagos_usuario_id_fkey(nombre_completo, avatar_url, email)")
      .eq("usuario_id", usuarioId)
      .order("created_at", { ascending: false });

    if (anio) {
      const { data: detalleAnio } = await supabase
        .from("detalle_pago")
        .select("pago_id")
        .eq("anio", anio);
        const pagoIds = Array.from(new Set((detalleAnio || []).map((d) => d.pago_id)));
        if (pagoIds.length > 0) {
          query = query.in("id", pagoIds);
        } else {
          return [];
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const pagos = data || [];

      const approvedIds = Array.from(new Set(pagos.filter(p => p.approved_by).map(p => p.approved_by as string)));
    if (approvedIds.length > 0) {
      const { data: approvers } = await supabase
        .from("profiles")
        .select("id, nombre_completo")
        .in("id", approvedIds);
      const approverMap = new Map((approvers || []).map(a => [a.id, a.nombre_completo]));
      for (const pago of pagos) {
        if (pago.approved_by) {
          pago.approved_by_profile = { nombre_completo: approverMap.get(pago.approved_by) || "—" } as Profile;
        }
      }
    }

    return pagos;
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
    if (profile?.role !== "super_admin") {
      throw new Error(messages.toast.noAutorizado);
    }

    const comprobanteUrl = input.metodo_pago === "efectivo" ? null : (input.comprobante_url || null);

    const { data: pago, error: pagoError } = await this.supabase
      .from("pagos")
      .insert({
        usuario_id: input.usuario_id,
        estado: "aprobado",
        metodo_pago: input.metodo_pago,
        codigo_billete: input.codigo_billete || null,
        comprobante_url: comprobanteUrl,
        notas: input.notas || null,
        created_by: user.id,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (pagoError) {
      if (pagoError.message?.includes("row-level security")) {
        throw new Error("No tienes permiso para registrar este pago");
      }
      throw new Error(messages.toast.pagoError);
    }

    const detalles = input.detalles.map((d) => ({
      pago_id: pago.id,
      mes: d.mes,
      anio: d.anio,
      tipo_pago: d.tipo_pago,
      monto: d.monto,
    }));

    const { error: detalleError } = await this.supabase
      .from("detalle_pago")
      .insert(detalles);

    if (detalleError) {
      await this.supabase.from("pagos").delete().eq("id", pago.id);
      throw new Error(messages.toast.pagoError);
    }

    const tieneInscripcion = detalles.some((d) => d.tipo_pago === "inscripcion");
    if (tieneInscripcion) {
      await this.supabase
        .from("profiles")
        .update({
          inscripcion_pagada: true,
          inscripcion_fecha: new Date().toISOString().split("T")[0],
        })
        .eq("id", input.usuario_id);
    }

    return { ...pago, detalle: detalles as DetallePago[] };
  }

  async crearPagoSuspendido(usuarioId: string, meses: { mes: number; anio: number }[], motivo?: string): Promise<number> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    let count = 0;

    for (const { mes, anio } of meses) {
      const { data: detalleExistente } = await this.supabase
        .from("detalle_pago")
        .select("pago_id, pagos!inner(id, estado)")
        .eq("mes", mes)
        .eq("anio", anio)
        .eq("pagos.usuario_id", usuarioId)
        .eq("pagos.estado", "pendiente")
        .maybeSingle();

      if (detalleExistente) {
        const { error } = await this.supabase
          .from("pagos")
          .update({
            estado: "pendiente",
            metodo_pago: "efectivo",
            notas: motivo || "Solicitud de suspensión",
            approved_by: null,
            approved_at: null,
          })
          .eq("id", detalleExistente.pago_id);
        if (!error) count++;
      } else {
        const { data: nuevoPago, error: pagoError } = await this.supabase
          .from("pagos")
          .insert({
            usuario_id: usuarioId,
            metodo_pago: "efectivo",
            notas: motivo || "Solicitud de suspensión",
            created_by: user.id,
          })
          .select()
          .single();

        if (!pagoError && nuevoPago) {
          const { error: detError } = await this.supabase
            .from("detalle_pago")
            .insert({
              pago_id: nuevoPago.id,
              mes,
              anio,
              tipo_pago: "mensualidad",
              monto: 0,
            });
          if (!detError) count++;
        }
      }
    }

    return count;
  }

  async listarPagos(estado?: string, anio?: number, mes?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<Pago[]> {
    const supabase = supabaseClient || this.supabase;
    let query = supabase
      .from("pagos")
      .select("*, detalle:detalle_pago(*), profile:profiles!pagos_usuario_id_fkey(nombre_completo, avatar_url, email)")
      .order("created_at", { ascending: false });

    if (estado) {
      query = query.eq("estado", estado);
    }

    if (anio || mes) {
      let detalleQuery = supabase.from("detalle_pago").select("pago_id");
      if (anio) detalleQuery = detalleQuery.eq("anio", anio);
      if (mes) detalleQuery = detalleQuery.eq("mes", mes);
      const { data: detalleMatches } = await detalleQuery;
      const pagoIds = Array.from(new Set((detalleMatches || []).map((d) => d.pago_id)));
      if (pagoIds.length > 0) {
        query = query.in("id", pagoIds);
      } else {
        return [];
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    const pagos = data || [];
    const approvedIds = Array.from(new Set(pagos.filter(p => p.approved_by).map(p => p.approved_by as string)));
    if (approvedIds.length > 0) {
      const { data: approvers } = await supabase
        .from("profiles")
        .select("id, nombre_completo")
        .in("id", approvedIds);
      const approverMap = new Map((approvers || []).map(a => [a.id, a.nombre_completo]));
      for (const pago of pagos) {
        if (pago.approved_by) {
          pago.approved_by_profile = { nombre_completo: approverMap.get(pago.approved_by) || "—" } as Profile;
        }
      }
    }

    return pagos;
  }

  async pagosPendientes(supabaseClient?: ReturnType<typeof createClient>): Promise<Pago[]> {
    return this.listarPagos("pendiente", undefined, undefined, supabaseClient);
  }

  async mesesPendientes(usuarioId: string, anio?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<{ mes: number; anio: number }[]> {
    const supabase = supabaseClient || this.supabase;
    const { data: pagos, error } = await supabase
      .from("pagos")
      .select("id, estado")
      .eq("usuario_id", usuarioId)
      .in("estado", ["aprobado", "pendiente"]);

    if (error || !pagos) return [];

    const pagoIds = pagos.map((p) => p.id);
    if (pagoIds.length === 0) return [];

    const { data: detalles } = await supabase
      .from("detalle_pago")
      .select("mes, anio, pago_id")
      .in("pago_id", pagoIds)
      .not("mes", "is", null);

    const anioFiltro = anio || new Date().getFullYear();

    const mesesConPago = new Set<string>();
    for (const d of detalles || []) {
      if (d.anio === anioFiltro && d.mes) {
        mesesConPago.add(`${d.mes}-${d.anio}`);
      }
    }

    const mesesPendientes: { mes: number; anio: number }[] = [];
    for (let mes = 12; mes >= 1; mes--) {
      if (!mesesConPago.has(`${mes}-${anioFiltro}`)) {
        mesesPendientes.push({ mes, anio: anioFiltro });
      }
    }

    return mesesPendientes.reverse();
  }

  async mesesPendientesAdmin(usuarioId: string, anio?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<{ mes: number; anio: number }[]> {
    return this.mesesPendientes(usuarioId, anio, supabaseClient);
  }

  async tieneInscripcionPendiente(usuarioId: string, supabaseClient?: ReturnType<typeof createClient>): Promise<boolean> {
    const supabase = supabaseClient || this.supabase;
    const { data: pagos } = await supabase
      .from("pagos")
      .select("id")
      .eq("usuario_id", usuarioId)
      .in("estado", ["pendiente", "aprobado"])
      .limit(1);

    if (!pagos || pagos.length === 0) return false;

    const { data: detalles } = await supabase
      .from("detalle_pago")
      .select("id")
      .eq("pago_id", pagos[0].id)
      .eq("tipo_pago", "inscripcion")
      .limit(1);

    return !!detalles && detalles.length > 0;
  }

  async pagosRecientesAprobados(anio?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<Pago[]> {
    const supabase = supabaseClient || this.supabase;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    let query = supabase
      .from("pagos")
      .select("*, detalle:detalle_pago(*)")
      .eq("estado", "aprobado")
      .order("created_at", { ascending: false });

    if (anio) {
      const { data: detalleAnio } = await supabase
        .from("detalle_pago")
        .select("pago_id")
        .eq("anio", anio);
      const pagoIds = Array.from(new Set((detalleAnio || []).map((d) => d.pago_id)));
      if (pagoIds.length > 0) {
        query = query.in("id", pagoIds);
      } else {
        return [];
      }
    }

    const { data, error } = await query.limit(10);
    if (error) throw error;
    return data || [];
  }

  async aniosConPagos(usuarioId?: string, supabaseClient?: ReturnType<typeof createClient>): Promise<number[]> {
    const supabase = supabaseClient || this.supabase;
    let query = supabase
      .from("pagos")
      .select("id");

    if (usuarioId) {
      query = query.eq("usuario_id", usuarioId);
    }

    const { data: pagos } = await query;
    if (!pagos || pagos.length === 0) return [new Date().getFullYear()];

    const { data: detalles } = await supabase
      .from("detalle_pago")
      .select("anio, pago_id")
      .in("pago_id", pagos.map((p) => p.id));

    const anios = Array.from(new Set((detalles || []).map((d) => d.anio).filter(Boolean))) as number[];
    if (!anios.includes(new Date().getFullYear())) {
      anios.push(new Date().getFullYear());
    }
    return anios.sort((a, b) => b - a);
  }

  async stats(anio?: number, supabaseClient?: ReturnType<typeof createClient>) {
    const supabase = supabaseClient || this.supabase;
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();
    const mesActual = hoy.getMonth() + 1;

    const [allProfiles, libres, configResult, ownerResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, inscripcion_pagada, fecha_inicio, activo, role, email")
        .in("role", ["miembro", "super_admin"]),
      supabase
        .from("membresias")
        .select("usuario_id")
        .is("fecha_fin", null),
      supabase
        .from("gym_config_metodos_pago")
        .select("monto_mensual, monto_inscripcion")
        .eq("habilitado", true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("gym_config")
        .select("dueno_email")
        .limit(1)
        .maybeSingle(),
    ]);

    const ownerEmail = ownerResult.data?.dueno_email?.toLowerCase() || "";
    const config = configResult.data;

    const allMiembros = allProfiles.data || [];
    const miembrosLibresIds = new Set((libres.data || []).map((l) => l.usuario_id));
    const montoMensual = config?.monto_mensual || 5;
    const montoInscripcion = config?.monto_inscripcion || 0;

    const { data: pagosAnio } = await supabase
      .from("pagos")
      .select("id, usuario_id, estado, notas")
      .in("estado", ["aprobado", "pendiente"]);

    const pagosIds = (pagosAnio || []).map((p) => p.id);

    const { data: detallesAnio } = await supabase
      .from("detalle_pago")
      .select("pago_id, mes, anio, monto, tipo_pago")
      .in("pago_id", pagosIds.length > 0 ? pagosIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("anio", anioConsulta);

    const pagoMap = new Map((pagosAnio || []).map((p) => [p.id, p]));

    const pagosConDetalle = (detallesAnio || []).map((d) => ({
      ...d,
      estado: pagoMap.get(d.pago_id)?.estado || "pendiente",
      usuario_id: pagoMap.get(d.pago_id)?.usuario_id || "",
      notas: pagoMap.get(d.pago_id)?.notas || null,
    }));

    const todosPagosAprobados = pagosConDetalle.filter((p) => p.estado === "aprobado");
    const miembrosConInscripcionPagada = new Set<string>();
    for (const pago of todosPagosAprobados) {
      if (pago.tipo_pago === "inscripcion") {
        miembrosConInscripcionPagada.add(pago.usuario_id);
      }
    }

    for (const m of allMiembros) {
      if (m.inscripcion_pagada) {
        miembrosConInscripcionPagada.add(m.id);
      }
    }

    const miembrosActivos = allMiembros.filter((m) => m.activo !== false && m.email?.toLowerCase() !== ownerEmail);
    const inscritosPagados = miembrosActivos.filter((m) => miembrosConInscripcionPagada.has(m.id)).length;
    const inscritosPendientes = miembrosActivos.filter((m) => !miembrosConInscripcionPagada.has(m.id)).length;

    const morosos = await this.getMiembrosMorosos(anioConsulta, supabase);
    const deudoresInscripcion = morosos.filter((m) => m.debeInscripcion).length;
    const deudoresMensualidad = morosos.filter((m) => m.mesesDeuda.length > 0).length;
    const montoDeudaInscripcion = morosos.filter((m) => m.debeInscripcion).length * montoInscripcion;
    const montoDeudaMensualidad = morosos.reduce((sum, m) => sum + m.mesesDeuda.length, 0) * montoMensual;
    const montoDeuda = montoDeudaInscripcion + montoDeudaMensualidad;

    const pagosMesActual = pagosConDetalle.filter(
      (p) => p.estado === "aprobado" && p.mes === mesActual && p.anio === anioConsulta && p.tipo_pago === "mensualidad"
    );
    const usuariosAlDia = new Set(
      pagosMesActual.filter((p) => miembrosConInscripcionPagada.has(p.usuario_id)).map((p) => p.usuario_id)
    );
    const alDiaMensualidad = usuariosAlDia.size;
    const montoPagado = pagosMesActual
      .filter((p) => usuariosAlDia.has(p.usuario_id))
      .reduce((sum, p) => sum + (p.monto || 0), 0);

    return {
      totalMiembros: miembrosActivos.length,
      miembrosActivos: miembrosActivos.length,
      inscritosPagados,
      inscritosPendientes,
      deudoresTotal: morosos.length,
      deudoresInscripcion,
      deudoresMensualidad,
      alDiaMensualidad,
      montoDeuda,
      montoDeudaInscripcion,
      montoDeudaMensualidad,
      montoPagado,
      membresiaLibre: miembrosLibresIds.size,
      pagosConfirmados: todosPagosAprobados.length,
      pagosPendientes: pagosConDetalle.filter((p) => p.estado === "pendiente").length,
      ingresosMes: montoPagado,
    };
  }

  async getMiembrosMorosos(anio?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<
    Array<{
      id: string;
      email: string;
      nombre_completo: string;
      deudas: Array<{ mes: number; anio: number; monto: number }>;
      totalDeuda: number;
      debeInscripcion: boolean;
      mesesDeuda: number[];
    }>
  > {
    const supabase = supabaseClient || this.supabase;
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();
    const mesActual = anioConsulta === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;

    const [miembrosResult, configResult, libresResult, ownerResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, nombre_completo, inscripcion_pagada, activo, fecha_inicio")
        .in("role", ["miembro", "super_admin"])
        .not("email", "is", null),
      supabase
        .from("gym_config_metodos_pago")
        .select("monto_mensual, monto_inscripcion")
        .eq("habilitado", true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("membresias")
        .select("usuario_id, fecha_inicio")
        .is("fecha_fin", null),
      supabase
        .from("gym_config")
        .select("dueno_email, modo_cobro")
        .limit(1)
        .maybeSingle(),
    ]);

    const miembros = (miembrosResult.data || []).filter((m) => m.activo !== false);
    if (miembros.length === 0) return [];

    const montoMensual = configResult.data?.monto_mensual || 0;
    const montoInscripcion = configResult.data?.monto_inscripcion || 0;
    const miembrosLibresIds = new Set((libresResult.data || []).map((l) => l.usuario_id));
    const fechaInicioMap = new Map<string, string>();
    for (const l of libresResult.data || []) {
      if (l.fecha_inicio) fechaInicioMap.set(l.usuario_id, l.fecha_inicio);
    }
    const ownerEmail = ownerResult.data?.dueno_email?.toLowerCase() || "";
    const modoCobro = (ownerResult.data?.modo_cobro as "dia_uno" | "fecha_inscripcion") || "dia_uno";

    const { data: todosPagosHeader } = await supabase
      .from("pagos")
      .select("id, usuario_id, estado, notas");

    const pagoIds = (todosPagosHeader || []).map((p) => p.id);
    const { data: todosDetalles } = await supabase
      .from("detalle_pago")
      .select("pago_id, mes, anio, monto, tipo_pago")
      .in("pago_id", pagoIds.length > 0 ? pagoIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("anio", anioConsulta);

    const pagoHeaderMap = new Map((todosPagosHeader || []).map((p) => [p.id, p]));

    const todosPagos = (todosDetalles || []).map((d) => ({
      usuario_id: pagoHeaderMap.get(d.pago_id)?.usuario_id || "",
      mes_pagar: d.mes,
      anio_pagar: d.anio,
      monto: d.monto,
      estado: pagoHeaderMap.get(d.pago_id)?.estado || "pendiente",
      notas: pagoHeaderMap.get(d.pago_id)?.notas || null,
      tipo_pago: d.tipo_pago,
    }));

    const pagosAprobados = todosPagos.filter((p) => p.estado === "aprobado");
    const pagosQueCubrenMes = todosPagos.filter((p) => p.estado === "aprobado" || p.estado === "suspendido");

    const miembrosConInscripcionPagada = new Set<string>();
    for (const pago of pagosAprobados) {
      if (pago.tipo_pago === "inscripcion") {
        miembrosConInscripcionPagada.add(pago.usuario_id);
      }
    }
    for (const m of miembros) {
      if (m.inscripcion_pagada) miembrosConInscripcionPagada.add(m.id);
    }

    const morosos: Array<{
      id: string;
      email: string;
      nombre_completo: string;
      deudas: Array<{ mes: number; anio: number; monto: number }>;
      totalDeuda: number;
      debeInscripcion: boolean;
      mesesDeuda: number[];
    }> = [];

    for (const miembro of miembros) {
      if (miembrosLibresIds.has(miembro.id)) continue;
      if (miembro.email?.toLowerCase() === ownerEmail) continue;

      const debeInscripcion = !miembrosConInscripcionPagada.has(miembro.id);

      const fechaInicioMembresia = fechaInicioMap.get(miembro.id);
      const fechaInscripcion = miembro.fecha_inicio;
      const fechaInicioStr = fechaInicioMembresia || fechaInscripcion;
      let primerMesDeuda = 1;
      if (fechaInicioStr) {
        const parts = fechaInicioStr.split("-").map(Number);
        const anioInicio = parts[0];
        const mesInicio = parts[1];

        let mesDeuda = mesInicio + 1;
        let anioDeuda = anioInicio;
        if (mesDeuda > 12) {
          mesDeuda = 1;
          anioDeuda = anioInicio + 1;
        }

        if (anioDeuda > anioConsulta) continue;
        if (anioDeuda === anioConsulta) {
          primerMesDeuda = mesDeuda;
        }
      }

      const pagosMiembroQueCubren = pagosQueCubrenMes.filter((p) => p.usuario_id === miembro.id);
      const mesesCubiertos = new Set(pagosMiembroQueCubren.map((p) => p.mes_pagar));

      const mesesDeuda: number[] = [];
      for (let mes = primerMesDeuda; mes <= mesActual; mes++) {
        if (mesesCubiertos.has(mes)) continue;

        const diaCobro = getDiaCobro(fechaInicioStr || "2000-01-01", mes, anioConsulta, modoCobro);

        if (mes === mesActual && hoy.getDate() < diaCobro) continue;

        mesesDeuda.push(mes);
      }

      if (!debeInscripcion && mesesDeuda.length === 0) continue;

      const pagosPendientes = todosPagos.filter(
        (p) => p.usuario_id === miembro.id && p.anio_pagar === anioConsulta &&
          p.tipo_pago === "mensualidad" &&
          ["pendiente", "rechazado"].includes(p.estado)
      );
      const montoByMes = new Map<number, number>();
      for (const p of pagosPendientes) {
        if (!montoByMes.has(p.mes_pagar!)) montoByMes.set(p.mes_pagar!, p.monto);
      }

      const deudas = mesesDeuda.map((mes) => ({
        mes,
        anio: anioConsulta,
        monto: montoByMes.get(mes) || montoMensual,
      }));

      const totalDeuda = mesesDeuda.length * montoMensual + (debeInscripcion ? montoInscripcion : 0);

      morosos.push({
        id: miembro.id,
        email: miembro.email!,
        nombre_completo: miembro.nombre_completo,
        deudas,
        totalDeuda,
        debeInscripcion,
        mesesDeuda,
      });
    }

    return morosos;
  }

  async monthlyStats(anio?: number, supabaseClient?: ReturnType<typeof createClient>) {
    const supabase = supabaseClient || this.supabase;
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();
    const mesMaximo = anioConsulta === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;

    let config = null;
    try {
      const { data } = await supabase
        .from("gym_config_metodos_pago")
        .select("monto_mensual")
        .eq("habilitado", true)
        .limit(1)
        .maybeSingle();
      config = data;
    } catch (_error /* eslint-disable-line @typescript-eslint/no-unused-vars */) {
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

    const { data: configData } = await supabase
      .from("gym_config")
      .select("dueno_email")
      .limit(1)
      .maybeSingle();
    const ownerEmail = configData?.dueno_email?.toLowerCase() || "";

    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, fecha_inicio, role, email, activo")
      .in("role", ["miembro", "super_admin"]);

    const profiles = (allProfiles || []).filter(
      (p) => p.activo !== false && p.email?.toLowerCase() !== ownerEmail
    );

    const { data: libreData } = await supabase
      .from("membresias")
      .select("usuario_id")
      .is("fecha_fin", null);

    const libresIds = new Set((libreData || []).map((l) => l.usuario_id));
    const libresCount = libresIds.size;

    const statsMeses = await Promise.all(
      meses.map(async (m) => {
        const finMes = new Date(m.anio, m.mes, 0);

        const miembrosMes = profiles.filter((p) => {
          const fechaInsc = p.fecha_inicio ? new Date(p.fecha_inicio) : null;
          if (fechaInsc && fechaInsc > finMes) return false;
          return true;
        });

        const totalMiembrosMes = miembrosMes.length;
        const idsMes = new Set(miembrosMes.map((p) => p.id));

        return { mes: m.mes, anio: m.anio, nombre: m.nombre, totalMiembrosMes, idsMes };
      })
    );

    const { data: pagosHeader } = await supabase
      .from("pagos")
      .select("id, usuario_id, estado")
      .in("estado", ["aprobado", "pendiente", "suspendido"]);

    const pagoIds = (pagosHeader || []).map((p) => p.id);
    const { data: allDetalles } = await supabase
      .from("detalle_pago")
      .select("pago_id, mes, anio, monto")
      .in("pago_id", pagoIds.length > 0 ? pagoIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("anio", anioConsulta);

    const pagoEstadoMap = new Map((pagosHeader || []).map((p) => [p.id, { estado: p.estado, usuario_id: p.usuario_id }]));

    const pagosAll = (allDetalles || []).map((d) => {
      const header = pagoEstadoMap.get(d.pago_id);
      return {
        usuario_id: header?.usuario_id || "",
        estado: header?.estado || "pendiente",
        monto: d.monto,
        mes_pagar: d.mes,
        anio_pagar: d.anio,
      };
    });

    const mesesFinal = statsMeses.map((m) => {
      const pagosMes = pagosAll.filter((p) => p.mes_pagar === m.mes && p.anio_pagar === m.anio);

      const pagados = new Set(
        pagosMes.filter((p) => (p.estado === "aprobado" || p.estado === "suspendido") && m.idsMes.has(p.usuario_id)).map((p) => p.usuario_id)
      ).size;

      const montoAcumulado = pagosMes
        .filter((p) => p.estado === "aprobado")
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
