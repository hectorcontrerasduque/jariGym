import { createClient } from "@/lib/supabase/client";
import { getMonthName } from "@/lib/utils";
import { messages } from "@/lib/messages";
import type { Pago, MetodoPago, TipoPago, Profile } from "@/lib/types";

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
      created_by: user.id,
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

    const { data: pagoActual } = await this.supabase
      .from("pagos")
      .select("estado")
      .eq("id", pagoId)
      .single();

    const nuevoEstado = pagoActual?.estado === "suspendido_pendiente" ? "suspendido" : "aprobado";

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

    if (data.tipo_pago === "inscripcion") {
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
    if (profile?.role !== "super_admin" && profile?.role !== "admin") {
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
      .in("estado", ["pendiente", "suspendido_pendiente"])
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
    const isAdmin = profile?.role === "super_admin" || profile?.role === "admin";

    const query = this.supabase.from("pagos").delete().eq("id", pagoId);

    if (isAdmin) {
      query.in("estado", ["pendiente", "suspendido_pendiente"]);
    } else {
      query.eq("usuario_id", user.id).in("estado", ["pendiente", "suspendido_pendiente"]);
    }

    const { error } = await query;
    if (error) throw error;
  }

  async listarMisPagos(anio?: number, mes?: number): Promise<Pago[]> {
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
    if (mes) {
      query = query.eq("mes_pagar", mes);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async listarPagosUsuario(usuarioId: string, anio?: number): Promise<Pago[]> {
    let query = this.supabase
      .from("pagos")
      .select("*, profile:profiles!pagos_usuario_id_fkey(nombre_completo, avatar_url, email)")
      .eq("usuario_id", usuarioId)
      .order("created_at", { ascending: false });

    if (anio) {
      query = query.eq("anio_pagar", anio);
    }

    const { data, error } = await query;
    if (error) throw error;

    const pagos = data || [];

    const approvedIds = Array.from(new Set(pagos.filter(p => p.approved_by).map(p => p.approved_by as string)));
    if (approvedIds.length > 0) {
      const { data: approvers } = await this.supabase
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
    if (profile?.role !== "super_admin" && profile?.role !== "admin") {
      throw new Error(messages.toast.noAutorizado);
    }

    const pagoData: Record<string, unknown> = {
      ...input,
      estado: "aprobado",
      created_by: user.id,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
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

    if (data.tipo_pago === "inscripcion") {
      await this.supabase
        .from("profiles")
        .update({
          inscripcion_pagada: true,
          inscripcion_fecha: new Date().toISOString().split("T")[0],
        })
        .eq("id", data.usuario_id);
    }

    return data;
  }

  async crearPagoSuspendido(usuarioId: string, meses: { mes: number; anio: number }[], motivo?: string): Promise<number> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    let count = 0;

    for (const { mes, anio } of meses) {
      const { data: existente } = await this.supabase
        .from("pagos")
        .select("id, estado")
        .eq("usuario_id", usuarioId)
        .eq("mes_pagar", mes)
        .eq("anio_pagar", anio)
        .in("estado", ["pendiente", "suspendido_pendiente"])
        .maybeSingle();

      if (existente) {
        const { error } = await this.supabase
          .from("pagos")
          .update({
            estado: "suspendido_pendiente",
            monto: 0,
            metodo_pago: "efectivo",
            notas: motivo || "Solicitud de suspensión",
            approved_by: null,
            approved_at: null,
          })
          .eq("id", existente.id);
        if (!error) count++;
      } else {
        const { error } = await this.supabase
          .from("pagos")
          .insert({
            usuario_id: usuarioId,
            monto: 0,
            mes_pagar: mes,
            anio_pagar: anio,
            metodo_pago: "efectivo",
            tipo_pago: "membresia",
            estado: "suspendido_pendiente",
            notas: motivo || "Solicitud de suspensión",
            created_by: user.id,
          });
        if (!error) count++;
      }
    }

    return count;
  }

  async listarPagos(estado?: string, anio?: number, mes?: number): Promise<Pago[]> {
    let query = this.supabase
      .from("pagos")
      .select("*, profile:profiles!pagos_usuario_id_fkey(nombre_completo, avatar_url, email)")
      .order("created_at", { ascending: false });

    if (estado) {
      query = query.eq("estado", estado);
    }
    if (anio) {
      query = query.eq("anio_pagar", anio);
    }
    if (mes) {
      query = query.eq("mes_pagar", mes);
    }

    const { data, error } = await query;
    if (error) throw error;

    const pagos = data || [];
    const approvedIds = Array.from(new Set(pagos.filter(p => p.approved_by).map(p => p.approved_by as string)));
    if (approvedIds.length > 0) {
      const { data: approvers } = await this.supabase
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

  async pagosPendientes(): Promise<Pago[]> {
    return this.listarPagos("pendiente");
  }

  async mesesPendientes(usuarioId: string, anio?: number): Promise<{ mes: number; anio: number }[]> {
    const { data, error } = await this.supabase
      .from("pagos")
      .select("mes_pagar, anio_pagar, estado")
      .eq("usuario_id", usuarioId)
      .in("estado", ["aprobado", "pendiente", "suspendido_pendiente"])
      .order("anio_pagar", { ascending: false })
      .order("mes_pagar", { ascending: false });

    if (error) return [];

    const pagosAprobados = (data || []).map((p) => ({
      mes: p.mes_pagar,
      anio: p.anio_pagar,
    }));

    const anioFiltro = anio || new Date().getFullYear();

    const mesesPendientes: { mes: number; anio: number }[] = [];

    for (let mes = 12; mes >= 1; mes--) {
      const yaPago = pagosAprobados.some(
        (p) => p.mes === mes && p.anio === anioFiltro
      );
      if (!yaPago) {
        mesesPendientes.push({ mes, anio: anioFiltro });
      }
    }

    return mesesPendientes.reverse();
  }

  async mesesPendientesAdmin(usuarioId: string, anio?: number): Promise<{ mes: number; anio: number }[]> {
    return this.mesesPendientes(usuarioId, anio);
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

  async pagosRecientesAprobados(anio?: number): Promise<Pago[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    let query = this.supabase
      .from("pagos")
      .select("*")
      .eq("estado", "aprobado")
      .order("created_at", { ascending: false });

    if (anio) {
      query = query.eq("anio_pagar", anio);
    }

    const { data, error } = await query.limit(10);

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

    const [pendientes, allProfiles, pagosAnio, libres, configResult, ownerResult] = await Promise.all([
      this.supabase
        .from("pagos")
        .select("id, monto, usuario_id, mes_pagar, anio_pagar", { count: "exact", head: true })
        .eq("estado", "pendiente")
        .eq("anio_pagar", anioConsulta),
      this.supabase
        .from("profiles")
        .select("id, inscripcion_pagada, fecha_inscripcion, activo, role, email")
        .in("role", ["miembro", "admin", "super_admin"]),
      this.supabase
        .from("pagos")
        .select("monto, usuario_id, estado, anio_pagar, mes_pagar, notas")
        .eq("anio_pagar", anioConsulta),
      this.supabase
        .from("membresias")
        .select("usuario_id")
        .is("fecha_fin", null),
      this.supabase
        .from("gym_config_metodos_pago")
        .select("monto_mensual, monto_inscripcion")
        .eq("habilitado", true)
        .limit(1)
        .maybeSingle(),
      this.supabase
        .from("gym_config")
        .select("dueno_email")
        .limit(1)
        .maybeSingle(),
    ]);

    const ownerEmail = ownerResult.data?.dueno_email?.toLowerCase() || "";
    const config = configResult.data;

    const allMiembros = allProfiles.data || [];
    const pagosAnioData = pagosAnio.data || [];
    const miembrosLibresIds = new Set((libres.data || []).map((l) => l.usuario_id));
    const montoMensual = config?.monto_mensual || 5;
    const montoInscripcion = config?.monto_inscripcion || 0;

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
    for (const m of allMiembros) {
      if (m.inscripcion_pagada) {
        miembrosConInscripcionPagada.add(m.id);
      }
    }

    // Inscritos: activos con inscripción pagada (por pagos o profile), exclude gym owner
    const miembrosActivos = allMiembros.filter((m) => m.activo !== false && m.email?.toLowerCase() !== ownerEmail);
    const inscritosPagados = miembrosActivos.filter((m) => miembrosConInscripcionPagada.has(m.id)).length;
    const inscritosPendientes = miembrosActivos.filter((m) => !miembrosConInscripcionPagada.has(m.id)).length;

    // Deudores: usar función centralizada
    const morosos = await this.getMiembrosMorosos(anioConsulta);
    const deudoresInscripcion = morosos.filter((m) => m.debeInscripcion).length;
    const deudoresMensualidad = morosos.filter((m) => m.mesesDeuda.length > 0).length;
    const montoDeudaInscripcion = morosos.filter((m) => m.debeInscripcion).length * montoInscripcion;
    const montoDeudaMensualidad = morosos.reduce((sum, m) => sum + m.mesesDeuda.length, 0) * montoMensual;
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
      pagosPendientes: pendientes.count || 0,
      ingresosMes: montoPagado,
    };
  }

  async getMiembrosMorosos(anio?: number): Promise<
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
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();
    const mesActual = anioConsulta === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;

    const [miembrosResult, configResult, libresResult, ownerResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, nombre_completo, inscripcion_pagada")
        .eq("role", "miembro")
        .eq("activo", true)
        .not("email", "is", null),
      supabase
        .from("gym_config_metodos_pago")
        .select("monto_mensual, monto_inscripcion")
        .eq("habilitado", true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("membresias")
        .select("usuario_id")
        .is("fecha_fin", null),
      supabase
        .from("gym_config")
        .select("dueno_email")
        .limit(1)
        .maybeSingle(),
    ]);

    const miembros = miembrosResult.data;
    if (!miembros || miembros.length === 0) return [];

    const montoMensual = configResult.data?.monto_mensual || 0;
    const montoInscripcion = configResult.data?.monto_inscripcion || 0;
    const miembrosLibresIds = new Set((libresResult.data || []).map((l) => l.usuario_id));
    const ownerEmail = ownerResult.data?.dueno_email?.toLowerCase() || "";

    const { data: todosPagos } = await supabase
      .from("pagos")
      .select("usuario_id, mes_pagar, anio_pagar, monto, estado, notas")
      .eq("anio_pagar", anioConsulta);

    const pagosAprobados = (todosPagos || []).filter((p) => p.estado === "aprobado");

    // Determinar inscripción pagada
    const miembrosConInscripcionPagada = new Set<string>();
    for (const pago of pagosAprobados) {
      const isInscripcion = pago.notas?.toLowerCase().includes("inscripción") || pago.notas?.toLowerCase().includes("inscripcion");
      if (isInscripcion) miembrosConInscripcionPagada.add(pago.usuario_id);
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

      // Meses sin pago aprobado en el año consultado
      const pagosMiembroAprobados = pagosAprobados.filter((p) => p.usuario_id === miembro.id);
      const mesesPagados = new Set(pagosMiembroAprobados.map((p) => p.mes_pagar));

      const mesesDeuda: number[] = [];
      for (let mes = 1; mes <= mesActual; mes++) {
        if (!mesesPagados.has(mes)) {
          mesesDeuda.push(mes);
        }
      }

      if (!debeInscripcion && mesesDeuda.length === 0) continue;

      // Obtener pagos pendientes/suspendidos para el email
      const { data: pagosPendientes } = await supabase
        .from("pagos")
        .select("mes_pagar, anio_pagar, monto")
        .eq("usuario_id", miembro.id)
        .eq("anio_pagar", anioConsulta)
        .in("estado", ["pendiente", "suspendido", "suspendido_pendiente"]);

      const deudas = (pagosPendientes || []).map((p) => ({
        mes: p.mes_pagar,
        anio: p.anio_pagar,
        monto: p.monto,
      }));

      // Total: meses sin pago * montoMensual + inscripción si la debe
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
    } catch (error) {
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

    const { data: configData } = await this.supabase
      .from("gym_config")
      .select("dueno_email")
      .limit(1)
      .maybeSingle();
    const ownerEmail = configData?.dueno_email?.toLowerCase() || "";

    const { data: allProfiles } = await this.supabase
      .from("profiles")
      .select("id, fecha_inscripcion, role, email, activo")
      .in("role", ["miembro", "admin", "super_admin"]);

    const profiles = (allProfiles || []).filter(
      (p) => p.activo !== false && p.email?.toLowerCase() !== ownerEmail
    );

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

  async getMiembrosMorosos(): Promise<Array<{
    id: string;
    email: string;
    nombre_completo: string;
    deudas: Array<{ mes: number; anio: number; monto: number }>;
    totalDeuda: number;
    debeInscripcion: boolean;
  }>> {
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();

    const { data: ownerResult } = await this.supabase
      .from("gym_config")
      .select("dueno_email")
      .limit(1)
      .maybeSingle();
    const ownerEmail = ownerResult?.dueno_email?.toLowerCase() || "";

    const { data: miembros, error: miembrosErr } = await this.supabase
      .from("profiles")
      .select("id, email, nombre_completo, inscripcion_pagada, activo, role, fecha_inscripcion")
      .eq("role", "miembro")
      .or("activo.eq.true,activo.is.null")
      .not("email", "is", null);

    if (miembrosErr || !miembros || miembros.length === 0) return [];

    const miembrosActivos = miembros.filter(
      (m) => m.email && m.email.toLowerCase() !== ownerEmail
    );

    const miembroIds = miembrosActivos.map((m) => m.id);

    const { data: pagosAll } = await this.supabase
      .from("pagos")
      .select("usuario_id, mes_pagar, anio_pagar, monto, estado, notas")
      .in("usuario_id", miembroIds)
      .in("estado", ["aprobado", "pendiente", "suspendido", "suspendido_pendiente"]);

    const { data: libres } = await this.supabase
      .from("membresias")
      .select("usuario_id")
      .is("fecha_fin", null);

    const miembrosLibresIds = new Set((libres || []).map((l) => l.usuario_id));
    const allPagos = pagosAll || [];

    const miembrosMorosos: Array<{
      id: string;
      email: string;
      nombre_completo: string;
      deudas: Array<{ mes: number; anio: number; monto: number }>;
      totalDeuda: number;
      debeInscripcion: boolean;
    }> = [];

    for (const m of miembrosActivos) {
      if (miembrosLibresIds.has(m.id)) continue;

      let debeInscripcion = false;

      if (!m.inscripcion_pagada) {
        const tieneInscripcionAprobada = allPagos.some(
          (p) =>
            p.usuario_id === m.id &&
            p.estado === "aprobado" &&
            (p.notas?.toLowerCase().includes("inscripción") ||
              p.notas?.toLowerCase().includes("inscripcion"))
        );
        if (!tieneInscripcionAprobada) {
          debeInscripcion = true;
        }
      }

      const pagosAprobados = allPagos.filter(
        (p) => p.usuario_id === m.id && p.estado === "aprobado" && !p.notas?.toLowerCase().includes("inscripción") && !p.notas?.toLowerCase().includes("inscripcion")
      );
      const mesesAprobados = new Set(
        pagosAprobados.map((p) => `${p.anio_pagar}-${p.mes_pagar}`)
      );

      const deudas: Array<{ mes: number; anio: number; monto: number }> = [];

      const fechaInscripcion = m.fecha_inscripcion ? new Date(m.fecha_inscripcion) : null;
      const anioInscripcion = fechaInscripcion ? fechaInscripcion.getFullYear() : anioActual;
      const mesInscripcion = fechaInscripcion ? fechaInscripcion.getMonth() + 1 : 1;

      for (let anio = anioInscripcion; anio <= anioActual; anio++) {
        const mesInicio = anio === anioInscripcion ? mesInscripcion : 1;
        const mesFin = anio === anioActual ? mesActual : 12;
        for (let mes = mesInicio; mes <= mesFin; mes++) {
          if (!mesesAprobados.has(`${anio}-${mes}`)) {
            const pagoPendiente = allPagos.find(
              (p) =>
                p.usuario_id === m.id &&
                p.mes_pagar === mes &&
                p.anio_pagar === anio &&
                (p.estado === "pendiente" || p.estado === "suspendido" || p.estado === "suspendido_pendiente")
            );
            deudas.push({
              mes,
              anio,
              monto: pagoPendiente?.monto || 0,
            });
          }
        }
      }

      if (debeInscripcion || deudas.length > 0) {
        miembrosMorosos.push({
          id: m.id,
          email: m.email!,
          nombre_completo: m.nombre_completo,
          deudas,
          totalDeuda: deudas.reduce((sum, d) => sum + d.monto, 0),
          debeInscripcion,
        });
      }
    }

    return miembrosMorosos;
  }
}

export const pagosService = new PagosService();
