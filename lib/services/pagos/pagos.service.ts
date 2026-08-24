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

    const { data, error } = await this.supabase
      .from("pagos")
      .update({
        estado: "aprobado",
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
      query.eq("estado", "pendiente");
    } else {
      query.eq("usuario_id", user.id).eq("estado", "pendiente");
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
      .select("*, profile:profiles(nombre_completo, avatar_url, email), approved_by_profile:profiles!approved_by(nombre_completo)")
      .order("created_at", { ascending: false });

    if (anio) {
      query = query.eq("anio_pagar", anio);
    }

    const { data, error } = await query;
    if (error) {
      const fallback = await this.supabase
        .from("pagos")
        .select("*, profile:profiles(nombre_completo, avatar_url, email)")
        .eq("usuario_id", usuarioId)
        .order("created_at", { ascending: false });
      if (fallback.error) throw fallback.error;
      return fallback.data || [];
    }
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
      .select("*, profile:profiles(nombre_completo, avatar_url, email), approved_by_profile:profiles!approved_by(nombre_completo)")
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
      totalMiembros: miembrosActivos.length,
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
}

export const pagosService = new PagosService();
