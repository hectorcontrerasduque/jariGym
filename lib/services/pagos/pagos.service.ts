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
export interface PaymentDetailInput {
  month_number: number | null;
  year_number: number | null;
  payment_type: TipoPago;
  payment_amount: number;
}

export interface CreatePaymentInput {
  user_id: string;
  payment_method: MetodoPago;
  receipt_url?: string;
  bill_code?: string;
  payment_note?: string;
  detalles: PaymentDetailInput[];
}

export class PagosService {
  private supabase = createClient();

  async crearPago(input: CreatePaymentInput): Promise<Pago> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    const receiptUrl = input.payment_method === "efectivo" ? null : (input.receipt_url || null);

    const { data: pago, error: pagoError } = await this.supabase
      .from("payments")
      .insert({
        user_id: input.user_id,
        status: "pendiente",
        payment_method: input.payment_method,
        bill_code: input.bill_code || null,
        receipt_url: receiptUrl,
        payment_note: input.payment_note || null,
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
      payment_id: pago.id,
      month_number: d.month_number,
      year_number: d.year_number,
      payment_type: d.payment_type,
      payment_amount: d.payment_amount,
    }));

    const { error: detalleError } = await this.supabase
      .from("payment_detail")
      .insert(detalles);

    if (detalleError) {
      await this.supabase.from("payments").delete().eq("id", pago.id);
      throw new Error(messages.toast.pagoError);
    }

    return { ...pago, detail: detalles as DetallePago[] };
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
      .from("payments")
      .select("status")
      .eq("id", pagoId)
      .single();

    const newStatus = pagoActual?.status === "suspendido" ? "suspendido" : "aprobado";

    const { data, error } = await this.supabase
      .from("payments")
      .update({
        status: newStatus,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", pagoId)
      .select()
      .single();

    if (error) throw error;

    const { data: detalles } = await this.supabase
      .from("payment_detail")
      .select("payment_type")
      .eq("payment_id", pagoId);

    const tieneInscripcion = detalles?.some((d) => d.payment_type === "inscripcion");
    if (tieneInscripcion) {
      await this.supabase
        .from("profiles")
        .update({
          inscription_paid: true,
          inscription_date: new Date().toISOString().split("T")[0],
        })
        .eq("id", data.user_id);
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
      .from("payments")
      .update({
        status: "rechazado",
        payment_note: notas || "Pago rechazado",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", pagoId)
      .eq("status", "pendiente")
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async eliminarPago(pagoId: string): Promise<void> {
    const res = await fetch(`/api/pagos?id=${pagoId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || messages.toast.pagoEliminadoError);
    }
  }

  async listarMisPagos(anio?: number, mes?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<Pago[]> {
    const supabase = supabaseClient || this.supabase;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    let query = supabase
      .from("payments")
      .select("*, detail:payment_detail(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (anio || mes) {
      const { data: detalleMatches } = await supabase
        .from("payment_detail")
        .select("payment_id")
        .eq("year_number", anio || new Date().getFullYear())
        .eq("month_number", mes || 0);

      if (mes && detalleMatches && detalleMatches.length > 0) {
        const pagoIds = Array.from(new Set(detalleMatches.map((d) => d.payment_id)));
        query = query.in("id", pagoIds);
      } else if (anio && !mes) {
        const { data: detalleAnio } = await supabase
          .from("payment_detail")
          .select("payment_id")
          .eq("year_number", anio);
        const pagoIds = Array.from(new Set((detalleAnio || []).map((d) => d.payment_id)));
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
      .from("payments")
      .select("*, detail:payment_detail(*)")
      .eq("user_id", usuarioId)
      .order("created_at", { ascending: false });

    if (anio) {
      const { data: detalleAnio } = await supabase
        .from("payment_detail")
        .select("payment_id")
        .eq("year_number", anio);
        const pagoIds = Array.from(new Set((detalleAnio || []).map((d) => d.payment_id)));
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
        .select("id, full_name")
        .in("id", approvedIds);
      const approverMap = new Map((approvers || []).map(a => [a.id, a.full_name]));
      for (const pago of pagos) {
        if (pago.approved_by) {
          pago.approved_by_profile = { full_name: approverMap.get(pago.approved_by) || "—" } as Profile;
        }
      }
    }

    return pagos;
  }

  async crearPagoAprobado(input: CreatePaymentInput): Promise<Pago> {
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

    const receiptUrl = input.payment_method === "efectivo" ? null : (input.receipt_url || null);

    const { data: pago, error: pagoError } = await this.supabase
      .from("payments")
      .insert({
        user_id: input.user_id,
        status: "aprobado",
        payment_method: input.payment_method,
        bill_code: input.bill_code || null,
        receipt_url: receiptUrl,
        payment_note: input.payment_note || null,
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
      payment_id: pago.id,
      month_number: d.month_number,
      year_number: d.year_number,
      payment_type: d.payment_type,
      payment_amount: d.payment_amount,
    }));

    const { error: detalleError } = await this.supabase
      .from("payment_detail")
      .insert(detalles);

    if (detalleError) {
      await this.supabase.from("payments").delete().eq("id", pago.id);
      throw new Error(messages.toast.pagoError);
    }

    const tieneInscripcion = detalles.some((d) => d.payment_type === "inscripcion");
    if (tieneInscripcion) {
      await this.supabase
        .from("profiles")
        .update({
          inscription_paid: true,
          inscription_date: new Date().toISOString().split("T")[0],
        })
        .eq("id", input.user_id);
    }

    return { ...pago, detail: detalles as DetallePago[] };
  }

  async crearPagoSuspendido(usuarioId: string, meses: { month_number: number; year_number: number }[], motivo?: string, status?: "pendiente" | "suspendido"): Promise<number> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);

    const statusFinal = status || "pendiente";

    // Check if there's already an existing pending payment for any of these months
    const existingIds = new Set<string>();
    for (const { month_number: mes, year_number: anio } of meses) {
      const { data: detalleExistente } = await this.supabase
        .from("payment_detail")
        .select("payment_id, payments!inner(id, status)")
        .eq("month_number", mes)
        .eq("year_number", anio)
        .eq("payments.user_id", usuarioId)
        .in("payments.status", ["pendiente", "suspendido_pendiente"])
        .maybeSingle();

      if (detalleExistente) {
        existingIds.add(detalleExistente.payment_id);
      }
    }

    // Update existing pending payments to the new status
    for (const pagoId of existingIds) {
      await this.supabase
        .from("payments")
        .update({
          status: statusFinal,
          payment_method: "efectivo",
          payment_note: motivo || "Solicitud de suspensión",
          approved_by: null,
          approved_at: null,
        })
        .eq("id", pagoId);
    }

    // Create one new payment with all month details
    const { data: nuevoPago, error: pagoError } = await this.supabase
      .from("payments")
      .insert({
        user_id: usuarioId,
        status: statusFinal,
        payment_method: "efectivo",
        payment_note: motivo || "Solicitud de suspensión",
        created_by: user.id,
      })
      .select()
      .single();

    if (pagoError || !nuevoPago) return 0;

    // Insert all month details for this single payment
    const detalles = meses.map(({ month_number, year_number }) => ({
      payment_id: nuevoPago.id,
      month_number,
      year_number,
      payment_type: "mensualidad" as const,
      payment_amount: 0,
    }));

    const { error: detError } = await this.supabase
      .from("payment_detail")
      .insert(detalles);

    return detError ? 0 : meses.length;
  }

  async listarPagos(estado?: string, anio?: number, mes?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<Pago[]> {
    const supabase = supabaseClient || this.supabase;
    let query = supabase
      .from("payments")
      .select("*, detail:payment_detail(*)")
      .order("created_at", { ascending: false });

    if (estado) {
      query = query.eq("status", estado);
    }

    if (anio || mes) {
      let detalleQuery = supabase.from("payment_detail").select("payment_id");
      if (anio) detalleQuery = detalleQuery.eq("year_number", anio);
      if (mes) detalleQuery = detalleQuery.eq("month_number", mes);
      const { data: detalleMatches } = await detalleQuery;
      const pagoIds = Array.from(new Set((detalleMatches || []).map((d) => d.payment_id)));
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
        .select("id, full_name")
        .in("id", approvedIds);
      const approverMap = new Map((approvers || []).map(a => [a.id, a.full_name]));
      for (const pago of pagos) {
        if (pago.approved_by) {
          pago.approved_by_profile = { full_name: approverMap.get(pago.approved_by) || "—" } as Profile;
        }
      }
    }

    return pagos;
  }

  async pagosPendientes(supabaseClient?: ReturnType<typeof createClient>): Promise<Pago[]> {
    return this.listarPagos("pendiente", undefined, undefined, supabaseClient);
  }

  async mesesPendientes(usuarioId: string, anio?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<{ month_number: number; year_number: number }[]> {
    const supabase = supabaseClient || this.supabase;
    const { data: pagos, error } = await supabase
      .from("payments")
      .select("id, status")
      .eq("user_id", usuarioId)
      .in("status", ["aprobado", "pendiente", "suspendido"]);

    if (error || !pagos) return [];

    const pagoIds = pagos.map((p) => p.id);
    if (pagoIds.length === 0) return [];

    const { data: detalles } = await supabase
      .from("payment_detail")
      .select("month_number, year_number, payment_id")
      .in("payment_id", pagoIds)
      .not("month_number", "is", null);

    const anioFiltro = anio || new Date().getFullYear();

    const mesesConPago = new Set<string>();
    for (const d of detalles || []) {
      if (d.year_number === anioFiltro && d.month_number) {
        mesesConPago.add(`${d.month_number}-${d.year_number}`);
      }
    }

    const mesesPendientes: { month_number: number; year_number: number }[] = [];
    for (let mes = 12; mes >= 1; mes--) {
      if (!mesesConPago.has(`${mes}-${anioFiltro}`)) {
        mesesPendientes.push({ month_number: mes, year_number: anioFiltro });
      }
    }

    return mesesPendientes.reverse();
  }

  async mesesPendientesAdmin(usuarioId: string, anio?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<{ month_number: number; year_number: number }[]> {
    return this.mesesPendientes(usuarioId, anio, supabaseClient);
  }

  async tieneInscripcionPendiente(usuarioId: string, supabaseClient?: ReturnType<typeof createClient>): Promise<boolean> {
    const supabase = supabaseClient || this.supabase;
    const { data: pagos } = await supabase
      .from("payments")
      .select("id")
      .eq("user_id", usuarioId)
      .in("status", ["pendiente", "aprobado"])
      .limit(1);

    if (!pagos || pagos.length === 0) return false;

    const { data: detalles } = await supabase
      .from("payment_detail")
      .select("id")
      .eq("payment_id", pagos[0].id)
      .eq("payment_type", "inscripcion")
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
      .from("payments")
      .select("*, detail:payment_detail(*)")
      .eq("status", "aprobado")
      .order("created_at", { ascending: false });

    if (anio) {
      const { data: detalleAnio } = await supabase
        .from("payment_detail")
        .select("payment_id")
        .eq("year_number", anio);
      const pagoIds = Array.from(new Set((detalleAnio || []).map((d) => d.payment_id)));
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
      .from("payments")
      .select("id");

    if (usuarioId) {
      query = query.eq("user_id", usuarioId);
    }

    const { data: pagos } = await query;
    if (!pagos || pagos.length === 0) return [new Date().getFullYear()];

    const { data: detalles } = await supabase
      .from("payment_detail")
      .select("year_number, payment_id")
      .in("payment_id", pagos.map((p) => p.id));

    const anios = Array.from(new Set((detalles || []).map((d) => d.year_number).filter(Boolean))) as number[];
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

    const elegibles = await this.getMiembrosElegibles(supabase);
    const { miembros: allMiembros, miembrosLibresIds, ownerEmail, montoMensual, montoInscripcion } = elegibles;

    const miembrosActivos = allMiembros.filter((m) => m.email?.toLowerCase() !== ownerEmail);

    const { data: pagosAnio } = await supabase
      .from("payments")
      .select("id, user_id, status, payment_note")
      .in("status", ["aprobado", "pendiente"]);

    const pagosIds = (pagosAnio || []).map((p) => p.id);

    const { data: detallesAnio } = await supabase
      .from("payment_detail")
      .select("payment_id, month_number, year_number, payment_amount, payment_type")
      .in("payment_id", pagosIds.length > 0 ? pagosIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("year_number", anioConsulta);

    const pagoMap = new Map((pagosAnio || []).map((p) => [p.id, p]));

    const pagosConDetalle = (detallesAnio || []).map((d) => ({
      ...d,
      status: pagoMap.get(d.payment_id)?.status || "pendiente",
      user_id: pagoMap.get(d.payment_id)?.user_id || "",
      payment_note: pagoMap.get(d.payment_id)?.payment_note || null,
    }));

    const todosPagosAprobados = pagosConDetalle.filter((p) => p.status === "aprobado");
    const miembrosConInscripcionPagada = new Set<string>();
    for (const pago of todosPagosAprobados) {
      if (pago.payment_type === "inscripcion") {
        miembrosConInscripcionPagada.add(pago.user_id);
      }
    }

    for (const m of allMiembros) {
      if (m.inscription_paid) {
        miembrosConInscripcionPagada.add(m.id);
      }
    }

    const inscritosPagados = miembrosActivos.filter((m) => miembrosConInscripcionPagada.has(m.id)).length;
    const inscritosPendientes = miembrosActivos.filter((m) => !miembrosConInscripcionPagada.has(m.id)).length;

    const morosos = await this.getMiembrosMorosos(anioConsulta, supabase);
    const deudoresInscripcion = morosos.filter((m) => m.debeInscripcion).length;
    const deudoresMensualidad = morosos.filter((m) => m.mesesDeuda.length > 0).length;
    const montoDeudaInscripcion = morosos.filter((m) => m.debeInscripcion).length * montoInscripcion;
    const montoDeudaMensualidad = morosos.reduce((sum, m) => sum + m.mesesDeuda.length, 0) * montoMensual;
    const montoDeuda = montoDeudaInscripcion + montoDeudaMensualidad;

    const pagosMesActual = pagosConDetalle.filter(
      (p) => p.status === "aprobado" && p.month_number === mesActual && p.year_number === anioConsulta && p.payment_type === "mensualidad"
    );
    const usuariosAlDia = new Set(
      pagosMesActual.filter((p) => miembrosConInscripcionPagada.has(p.user_id)).map((p) => p.user_id)
    );
    const alDiaMensualidad = usuariosAlDia.size;
    const montoPagado = pagosMesActual
      .filter((p) => usuariosAlDia.has(p.user_id))
      .reduce((sum, p) => sum + (p.payment_amount || 0), 0);

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
      pagosPendientes: pagosConDetalle.filter((p) => p.status === "pendiente").length,
      ingresosMes: montoPagado,
    };
  }

  /**
   * Fuente centralizada de miembros elegibles.
   * Retorna miembros activos (excluyendo dueño y membresía libre) junto con
   * la configuración de cobro. Todas las funciones de morosos/deudas usan esto.
   */
  async getMiembrosElegibles(supabaseClient?: ReturnType<typeof createClient>) {
    const supabase = supabaseClient || this.supabase;

    const [miembrosResult, configResult, libresResult, ownerResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, inscription_paid, activo, start_date")
        .in("role", ["miembro", "super_admin"])
        .not("email", "is", null),
      supabase
        .from("gym_config_payment_methods")
        .select("amount_monthly, amount_inscription")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("user_id, start_date")
        .eq("status", "activa")
        .is("end_date", null),
      supabase
        .from("gym_config")
        .select("owner_email, billing_mode")
        .limit(1)
        .maybeSingle(),
    ]);

    const miembros = (miembrosResult.data || []).filter((m) => m.activo !== false);
    const now = new Date();
    const miembrosLibresIds = new Set(
      (libresResult.data || [])
        .filter((l) => {
          if (!l.start_date) return true;
          return new Date(l.start_date) <= now;
        })
        .map((l) => l.user_id)
    );
    const fechaInicioMap = new Map<string, string>();
    for (const l of libresResult.data || []) {
      if (l.start_date) fechaInicioMap.set(l.user_id, l.start_date);
    }
    const ownerEmail = ownerResult.data?.owner_email?.toLowerCase() || "";
    const modoCobro = (ownerResult.data?.billing_mode as "dia_uno" | "fecha_inscripcion") || "dia_uno";
    const montoMensual = configResult.data?.amount_monthly || 0;
    const montoInscripcion = configResult.data?.amount_inscription || 0;

    return {
      miembros,
      miembrosLibresIds,
      fechaInicioMap,
      ownerEmail,
      modoCobro,
      montoMensual,
      montoInscripcion,
    };
  }

  async getMiembrosMorosos(anio?: number, supabaseClient?: ReturnType<typeof createClient>): Promise<
    Array<{
      id: string;
      email: string;
      full_name: string;
      deudas: Array<{ month_number: number; year_number: number; payment_amount: number }>;
      totalDeuda: number;
      debeInscripcion: boolean;
      mesesDeuda: number[];
    }>
  > {
    const supabase = supabaseClient || this.supabase;
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();
    const mesActual = anioConsulta === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;

    const elegibles = await this.getMiembrosElegibles(supabase);
    const { miembros, miembrosLibresIds, fechaInicioMap, ownerEmail, modoCobro, montoMensual, montoInscripcion } = elegibles;

    if (miembros.length === 0) return [];

    const { data: todosPagosHeader } = await supabase
      .from("payments")
      .select("id, user_id, status, payment_note");

    const pagoIds = (todosPagosHeader || []).map((p) => p.id);
    const { data: todosDetalles } = await supabase
      .from("payment_detail")
      .select("payment_id, month_number, year_number, payment_amount, payment_type")
      .in("payment_id", pagoIds.length > 0 ? pagoIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("year_number", anioConsulta);

    const pagoHeaderMap = new Map((todosPagosHeader || []).map((p) => [p.id, p]));

    const todosPagos = (todosDetalles || []).map((d) => ({
      user_id: pagoHeaderMap.get(d.payment_id)?.user_id || "",
      month_number: d.month_number,
      year_number: d.year_number,
      payment_amount: d.payment_amount,
      status: pagoHeaderMap.get(d.payment_id)?.status || "pendiente",
      payment_note: pagoHeaderMap.get(d.payment_id)?.payment_note || null,
      payment_type: d.payment_type,
    }));

    const pagosAprobados = todosPagos.filter((p) => p.status === "aprobado");
    const pagosQueCubrenMes = todosPagos.filter((p) => p.status === "aprobado" || p.status === "suspendido");

    const miembrosConInscripcionPagada = new Set<string>();
    for (const pago of pagosAprobados) {
      if (pago.payment_type === "inscripcion") {
        miembrosConInscripcionPagada.add(pago.user_id);
      }
    }
    for (const m of miembros) {
      if (m.inscription_paid) miembrosConInscripcionPagada.add(m.id);
    }

    const morosos: Array<{
      id: string;
      email: string;
      full_name: string;
      deudas: Array<{ month_number: number; year_number: number; payment_amount: number }>;
      totalDeuda: number;
      debeInscripcion: boolean;
      mesesDeuda: number[];
    }> = [];

    for (const miembro of miembros) {
      if (miembrosLibresIds.has(miembro.id)) continue;
      if (miembro.email?.toLowerCase() === ownerEmail) continue;

      const debeInscripcion = !miembrosConInscripcionPagada.has(miembro.id);

      const fechaInicioMembresia = fechaInicioMap.get(miembro.id);
      const fechaInscripcion = miembro.start_date;

      let fechaInicioStr = fechaInicioMembresia || fechaInscripcion;
      if (fechaInicioMembresia) {
        const membershipStart = new Date(fechaInicioMembresia);
        if (membershipStart > hoy) {
          fechaInicioStr = fechaInscripcion;
          if (!fechaInicioStr) continue;
        }
      }

      let primerMesDeuda = 1;
      if (fechaInicioStr) {
        const parts = fechaInicioStr.split("-").map(Number);
        const anioInicio = parts[0];
        const mesInicio = parts[1];

        const anioDeuda = anioInicio;
        const mesDeuda = mesInicio;

        if (anioDeuda > anioConsulta) continue;
        if (anioDeuda === anioConsulta) {
          primerMesDeuda = mesDeuda;
        }
      }

      const pagosMiembroQueCubren = pagosQueCubrenMes.filter((p) => p.user_id === miembro.id);
      const mesesCubiertos = new Set(pagosMiembroQueCubren.map((p) => p.month_number));

      const mesesDeuda: number[] = [];
      for (let mes = primerMesDeuda; mes <= mesActual; mes++) {
        if (mesesCubiertos.has(mes)) continue;

        const diaCobro = getDiaCobro(fechaInicioStr || "2000-01-01", mes, anioConsulta, modoCobro);

        if (mes === mesActual && hoy.getDate() < diaCobro) continue;

        mesesDeuda.push(mes);
      }

      if (!debeInscripcion && mesesDeuda.length === 0) continue;

      const pagosPendientes = todosPagos.filter(
        (p) => p.user_id === miembro.id && p.year_number === anioConsulta &&
          p.payment_type === "mensualidad" &&
          ["pendiente", "rechazado"].includes(p.status)
      );
      const montoByMes = new Map<number, number>();
      for (const p of pagosPendientes) {
        if (!montoByMes.has(p.month_number!)) montoByMes.set(p.month_number!, p.payment_amount);
      }

      const deudas = mesesDeuda.map((mes) => ({
        month_number: mes,
        year_number: anioConsulta,
        payment_amount: montoByMes.get(mes) || montoMensual,
      }));

      const totalDeuda = mesesDeuda.length * montoMensual + (debeInscripcion ? montoInscripcion : 0);

      morosos.push({
        id: miembro.id,
        email: miembro.email!,
        full_name: miembro.full_name,
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

    const elegibles = await this.getMiembrosElegibles(supabase);
    const { miembros: allProfiles, miembrosLibresIds: libresIds, ownerEmail, montoMensual } = elegibles;

    const profiles = allProfiles.filter((p) => p.email?.toLowerCase() !== ownerEmail);
    const libresCount = libresIds.size;

    const meses = [];
    for (let mes = 1; mes <= mesMaximo; mes++) {
      meses.push({
        mes,
        anio: anioConsulta,
        nombre: getMonthName(mes),
      });
    }

    const statsMeses = await Promise.all(
      meses.map(async (m) => {
        const finMes = new Date(m.anio, m.mes, 0);

        const miembrosMes = profiles.filter((p) => {
          const fechaInsc = p.start_date ? new Date(p.start_date) : null;
          if (fechaInsc && fechaInsc > finMes) return false;
          return true;
        });

        const totalMiembrosMes = miembrosMes.length;
        const idsMes = new Set(miembrosMes.map((p) => p.id));

        return { mes: m.mes, anio: m.anio, nombre: m.nombre, totalMiembrosMes, idsMes };
      })
    );

    const { data: pagosHeader } = await supabase
      .from("payments")
      .select("id, user_id, status")
      .in("status", ["aprobado", "pendiente", "suspendido"]);

    const pagoIds = (pagosHeader || []).map((p) => p.id);
    const { data: allDetalles } = await supabase
      .from("payment_detail")
      .select("payment_id, month_number, year_number, payment_amount")
      .in("payment_id", pagoIds.length > 0 ? pagoIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("year_number", anioConsulta);

    const pagoEstadoMap = new Map((pagosHeader || []).map((p) => [p.id, { status: p.status, user_id: p.user_id }]));

    const pagosAll = (allDetalles || []).map((d) => {
      const header = pagoEstadoMap.get(d.payment_id);
      return {
        user_id: header?.user_id || "",
        status: header?.status || "pendiente",
        payment_amount: d.payment_amount,
        month_number: d.month_number,
        year_number: d.year_number,
      };
    });

    const mesesFinal = statsMeses.map((m) => {
      const pagosMes = pagosAll.filter((p) => p.month_number === m.mes && p.year_number === m.anio);

      const pagados = new Set(
        pagosMes.filter((p) => (p.status === "aprobado" || p.status === "suspendido") && m.idsMes.has(p.user_id)).map((p) => p.user_id)
      ).size;

      const montoAcumulado = pagosMes
        .filter((p) => p.status === "aprobado")
        .reduce((sum, p) => sum + (p.payment_amount || 0), 0);

      const libresMes = profiles.filter((p) => m.idsMes.has(p.id) && libresIds.has(p.id)).length;

      const sinPago = Math.max(0, m.totalMiembrosMes - pagados - libresMes);
      const montoAdeudado = sinPago * montoMensual;

      return {
        month_number: m.mes,
        year_number: m.anio,
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

// Backward compatibility aliases
export type DetallePagoInput = PaymentDetailInput;
export type CreatePagoInput = CreatePaymentInput;
