import { createClient } from "@/lib/supabase/client";
import { getMonthName, getDiaCobro } from "@/lib/utils";
import { messages } from "@/lib/messages";
import type { Pago, MetodoPago, TipoPago, Profile, DetallePago } from "@/lib/types";

interface PagoRPCRow {
  id: string;
  user_id: string;
  status: string;
  payment_note: string | null;
  payment_method: string | null;
  bill_code: string | null;
  receipt_url: string | null;
  created_at: string;
  month_number: number;
  year_number: number;
  payment_amount: number;
  payment_type: string;
}

export interface ElegiblesResult {
  miembros: Array<{ id: string; email: string | null; full_name: string | null; inscription_paid: boolean; activo: boolean | null; start_date: string | null; avatar_url: string | null; role: string | null; inscription_admin_note: string | null; arrival_time: string | null; departure_time: string | null }>;
  miembrosLibresIds: Set<string>;
  fechaInicioMap: Map<string, string>;
  ownerEmail: string;
  modoCobro: "dia_uno" | "fecha_inscripcion";
  montoMensual: number;
  montoInscripcion: number;
}



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

  private async getPagosPorAnio(anio: number, supabaseClient?: ReturnType<typeof createClient>): Promise<PagoRPCRow[]> {
    const supabase = supabaseClient || this.supabase;
    const { data, error } = await supabase.rpc("get_pagos_por_anio", { p_anio: anio });
    if (error) throw error;
    return (data as PagoRPCRow[]) || [];
  }

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
      .select("*, detail:payment_detail!inner(*)")
      .order("created_at", { ascending: false });

    if (estado) {
      query = query.eq("status", estado);
    }
    if (anio) {
      query = query.eq("detail.year_number", anio);
    }
    if (mes) {
      query = query.eq("detail.month_number", mes);
    }

    const { data, error } = await query;
    if (error) throw error;

    const pagosMap = new Map<string, Pago>();
    for (const row of data || []) {
      const existing = pagosMap.get(row.id);
      if (existing) {
        existing.detail = [...(existing.detail || []), row.detail];
      } else {
        pagosMap.set(row.id, { ...row, detail: [row.detail] });
      }
    }
    const pagos = Array.from(pagosMap.values());
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

  async mesesPendientes(usuarioId: string, anio?: number, supabaseClient?: ReturnType<typeof createClient>, startDate?: string): Promise<{ month_number: number; year_number: number }[]> {
    const supabase = supabaseClient || this.supabase;
    const anioFiltro = anio || new Date().getFullYear();

    // Single query: join payment_detail → payments, filter by user+status+year
    const { data: detalles, error } = await supabase
      .from("payment_detail")
      .select("month_number, year_number, payments!inner(id, status, user_id)")
      .eq("payments.user_id", usuarioId)
      .in("payments.status", ["aprobado", "pendiente", "suspendido"])
      .not("month_number", "is", null);

    if (error || !detalles) return [];

    const mesesConPago = new Set<string>();
    for (const d of detalles || []) {
      if (d.year_number === anioFiltro && d.month_number) {
        mesesConPago.add(`${d.month_number}-${d.year_number}`);
      }
    }

    let primerMesDeuda = 1;
    if (startDate) {
      const parts = startDate.split("-").map(Number);
      const anioInicio = parts[0];
      const mesInicio = parts[1];
      if (anioInicio > anioFiltro) return [];
      if (anioInicio === anioFiltro) primerMesDeuda = mesInicio;
    }

    const mesesPendientes: { month_number: number; year_number: number }[] = [];
    for (let mes = 12; mes >= primerMesDeuda; mes--) {
      if (!mesesConPago.has(`${mes}-${anioFiltro}`)) {
        mesesPendientes.push({ month_number: mes, year_number: anioFiltro });
      }
    }

    return mesesPendientes.reverse();
  }

  async mesesPendientesAdmin(usuarioId: string, anio?: number, supabaseClient?: ReturnType<typeof createClient>, startDate?: string): Promise<{ month_number: number; year_number: number }[]> {
    return this.mesesPendientes(usuarioId, anio, supabaseClient, startDate);
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
      .select("*, detail:payment_detail!inner(*)")
      .eq("status", "aprobado")
      .order("created_at", { ascending: false });

    if (anio) {
      query = query.eq("detail.year_number", anio);
    }

    const { data, error } = await query.limit(10);
    if (error) throw error;

    const pagosMap = new Map<string, Pago>();
    for (const row of data || []) {
      const existing = pagosMap.get(row.id);
      if (existing) {
        existing.detail = [...(existing.detail || []), row.detail];
      } else {
        pagosMap.set(row.id, { ...row, detail: [row.detail] });
      }
    }
    return Array.from(pagosMap.values());
  }

  async aniosConPagos(usuarioId?: string, supabaseClient?: ReturnType<typeof createClient>): Promise<number[]> {
    const supabase = supabaseClient || this.supabase;

    let query = supabase
      .from("payment_detail")
      .select("year_number");

    if (usuarioId) {
      query = query.eq("payments.user_id", usuarioId);
    }

    const { data: detalles } = await query;
    if (!detalles || detalles.length === 0) return [new Date().getFullYear()];

    const anios = Array.from(new Set((detalles || []).map((d) => d.year_number).filter(Boolean))) as number[];
    if (!anios.includes(new Date().getFullYear())) {
      anios.push(new Date().getFullYear());
    }
    return anios.sort((a, b) => b - a);
  }

  async stats(anio?: number, supabaseClient?: ReturnType<typeof createClient>, elegibles?: ElegiblesResult) {
    const supabase = supabaseClient || this.supabase;
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();
    const mesActual = hoy.getMonth() + 1;

    const elegiblesData = elegibles || await this.getMiembrosElegibles(supabase);
    const { miembros: allMiembros, miembrosLibresIds, ownerEmail, montoMensual, montoInscripcion } = elegiblesData;

    const miembrosActivos = allMiembros.filter((m) => m.email?.toLowerCase() !== ownerEmail);

    const rpcData = await this.getPagosPorAnio(anioConsulta, supabase);

    const pagosConDetalle = rpcData.map((d) => ({
      payment_id: d.id,
      month_number: d.month_number,
      year_number: d.year_number,
      payment_amount: d.payment_amount,
      payment_type: d.payment_type,
      status: d.status,
      user_id: d.user_id,
      payment_note: d.payment_note,
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

    const morosos = await this.getMiembrosMorosos(anioConsulta, supabase, elegiblesData);
    const deudoresInscripcion = morosos.filter((m) => m.debeInscripcion).length;
    const deudoresMensualidad = morosos.filter((m) => m.mesesDeuda.length > 0).length;
    const montoDeudaInscripcion = morosos.filter((m) => m.debeInscripcion).length * montoInscripcion;
    const montoDeudaMensualidad = morosos.reduce((sum, m) => sum + m.mesesDeuda.length, 0) * montoMensual;
    const montoDeuda = montoDeudaInscripcion + montoDeudaMensualidad;

    const pagosMesActual = pagosConDetalle.filter(
      (p) => ["aprobado", "suspendido"].includes(p.status) && p.month_number === mesActual && p.year_number === anioConsulta && p.payment_type === "mensualidad"
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
  async getMiembrosElegibles(supabaseClient?: ReturnType<typeof createClient>): Promise<ElegiblesResult> {
    const supabase = supabaseClient || this.supabase;

    const [miembrosResult, configResult, libresResult, ownerResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, inscription_paid, activo, start_date, avatar_url, role, inscription_admin_note, arrival_time, departure_time")
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

    const miembros = (miembrosResult.data || []).filter((m) => m.activo !== false && m.activo !== 0 && String(m.activo).toLowerCase() !== "false");
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

  async getMiembrosMorosos(anio?: number, supabaseClient?: ReturnType<typeof createClient>, elegibles?: ElegiblesResult): Promise<
    Array<{
      id: string;
      email: string;
      full_name: string;
      deudas: Array<{ month_number: number; year_number: number; payment_amount: number }>;
      totalDeuda: number;
      debeInscripcion: boolean;
      mesesDeuda: number[];
      pagosPendientes: number;
      montoPendiente: number;
    }>
  > {
    const supabase = supabaseClient || this.supabase;
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();
    const mesActual = anioConsulta === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;

    const elegiblesData = elegibles || await this.getMiembrosElegibles(supabase);
    const { miembros, miembrosLibresIds, fechaInicioMap, ownerEmail, modoCobro, montoMensual, montoInscripcion } = elegiblesData;

    if (miembros.length === 0) return [];

    const rpcData = await this.getPagosPorAnio(anioConsulta, supabase);

    const todosPagos = rpcData.map((d) => ({
      user_id: d.user_id,
      month_number: d.month_number,
      year_number: d.year_number,
      payment_amount: d.payment_amount,
      status: d.status,
      payment_note: d.payment_note,
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
      pagosPendientes: number;
      montoPendiente: number;
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

      const pagosPendientesMiembro = todosPagos.filter(
        (p) => p.user_id === miembro.id && p.year_number === anioConsulta &&
          p.payment_type === "mensualidad" && p.status === "pendiente"
      );
      const montoPendiente = pagosPendientesMiembro.reduce((sum, p) => sum + (p.payment_amount || montoMensual), 0);

      if (!debeInscripcion && mesesDeuda.length === 0 && pagosPendientesMiembro.length === 0) continue;

      const deudas = mesesDeuda.map((mes) => ({
        month_number: mes,
        year_number: anioConsulta,
        payment_amount: montoMensual,
      }));

      const totalDeuda = mesesDeuda.length * montoMensual + (debeInscripcion ? montoInscripcion : 0);

      morosos.push({
        id: miembro.id,
        email: miembro.email!,
        full_name: miembro.full_name || "",
        deudas,
        totalDeuda,
        debeInscripcion,
        mesesDeuda,
        pagosPendientes: pagosPendientesMiembro.length,
        montoPendiente,
      });
    }

    return morosos;
  }

  async getMigradosConDeuda(anio: number, supabaseClient?: ReturnType<typeof createClient>): Promise<
    Array<{
      id: string;
      email: string;
      full_name: string;
      deudas: Array<{ month_number: number; year_number: number; payment_amount: number }>;
      totalDeuda: number;
      debeInscripcion: boolean;
      mesesDeuda: number[];
      pagosPendientes: number;
      montoPendiente: number;
      esMigrado: boolean;
    }>
  > {
    const supabase = supabaseClient || this.supabase;

    const { data: configResult } = await supabase
      .from("gym_config_payment_methods")
      .select("amount_monthly")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const montoMensual = configResult?.amount_monthly || 0;

    const { data: rows } = await supabase
      .from("migracion")
      .select("nombre, correo, mes_pagar, anio_pagar, estado")
      .eq("migrado", "no");

    if (!rows || rows.length === 0) return [];

    const porNombre = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.nombre.toUpperCase();
      const arr = porNombre.get(key) || [];
      arr.push(row);
      porNombre.set(key, arr);
    }

    const resultado: Array<{
      id: string;
      email: string;
      full_name: string;
      deudas: Array<{ month_number: number; year_number: number; payment_amount: number }>;
      totalDeuda: number;
      debeInscripcion: boolean;
      mesesDeuda: number[];
      pagosPendientes: number;
      montoPendiente: number;
      esMigrado: boolean;
    }> = [];

    for (const [nombre, filas] of porNombre) {
      const mesesDeuda = filas
        .filter((f) => f.estado === "debe" && f.anio_pagar === anio)
        .map((f) => f.mes_pagar)
        .sort((a, b) => a - b);

      if (mesesDeuda.length < 3) continue;

      const deudas = mesesDeuda.map((mes) => ({
        month_number: mes,
        year_number: anio,
        payment_amount: montoMensual,
      }));

      resultado.push({
        id: `migracion-${nombre}`,
        email: filas.find((f) => f.correo)?.correo || "",
        full_name: nombre,
        deudas,
        totalDeuda: mesesDeuda.length * montoMensual,
        debeInscripcion: false,
        mesesDeuda,
        pagosPendientes: 0,
        montoPendiente: 0,
        esMigrado: true,
      });
    }

    return resultado;
  }

  async monthlyStats(anio?: number, supabaseClient?: ReturnType<typeof createClient>, elegibles?: ElegiblesResult) {
    const supabase = supabaseClient || this.supabase;
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();
    const mesMaximo = anioConsulta === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;

    const elegiblesData = elegibles || await this.getMiembrosElegibles(supabase);
    const { miembros: allProfiles, miembrosLibresIds: libresIds, ownerEmail, montoMensual } = elegiblesData;

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

    const rpcData = await this.getPagosPorAnio(anioConsulta, supabase);

    const pagosAll = rpcData.map((d) => ({
      user_id: d.user_id,
      status: d.status,
      payment_amount: d.payment_amount,
      month_number: d.month_number,
      year_number: d.year_number,
    }));

    const mesesFinal = statsMeses.map((m) => {
      const pagosMes = pagosAll.filter((p) => p.month_number === m.mes && p.year_number === m.anio);

      const pagados = new Set(
        pagosMes.filter((p) => (p.status === "aprobado" || p.status === "suspendido") && m.idsMes.has(p.user_id)).map((p) => p.user_id)
      ).size;

      const pendientes = new Set(
        pagosMes.filter((p) => p.status === "pendiente" && m.idsMes.has(p.user_id)).map((p) => p.user_id)
      ).size;

      const montoAcumulado = pagosMes
        .filter((p) => p.status === "aprobado")
        .reduce((sum, p) => sum + (p.payment_amount || 0), 0);

      const montoPendiente = pagosMes
        .filter((p) => p.status === "pendiente")
        .reduce((sum, p) => sum + (p.payment_amount || 0), 0);

      const sinPago = Math.max(0, m.totalMiembrosMes - pagados - pendientes);
      const montoAdeudado = sinPago * montoMensual;

      return {
        month_number: m.mes,
        year_number: m.anio,
        nombre: m.nombre,
        pagados,
        pendientes,
        sinPago,
        libres: 0,
        montoAcumulado,
        montoAdeudado,
        montoPendiente,
      };
    });

    return { totalMiembros: profiles.length, libres: libresCount, meses: mesesFinal };
  }

  async getMiembrosAlDia(anio?: number, supabaseClient?: ReturnType<typeof createClient>, elegibles?: ElegiblesResult): Promise<string[]> {
    const supabase = supabaseClient || this.supabase;
    const hoy = new Date();
    const anioConsulta = anio || hoy.getFullYear();
    const mesActual = hoy.getMonth() + 1;

    const elegiblesData = elegibles || await this.getMiembrosElegibles(supabase);
    const { miembros, ownerEmail, miembrosLibresIds } = elegiblesData;
    const miembrosActivos = miembros.filter((m) => m.email?.toLowerCase() !== ownerEmail && !miembrosLibresIds.has(m.id));

    // Step 1: query payment_detail by month+year (small result set)
    const { data: pagosDetalles } = await supabase
      .from("payment_detail")
      .select("payment_id")
      .eq("month_number", mesActual)
      .eq("year_number", anioConsulta)
      .eq("payment_type", "mensualidad");

    const pagoIds = [...new Set((pagosDetalles || []).map((d) => d.payment_id))];

    // Step 2: fetch only relevant headers
    const { data: pagosHeader } = pagoIds.length > 0
      ? await supabase
          .from("payments")
          .select("id, user_id")
          .in("id", pagoIds)
          .in("status", ["aprobado", "suspendido"])
      : { data: [] };

    const idsAlDia = new Set((pagosHeader || []).map((p) => p.user_id));

    return miembrosActivos.filter((m) => idsAlDia.has(m.id)).map((m) => m.id);
  }

  async getMiembrosLibres(supabaseClient?: ReturnType<typeof createClient>): Promise<string[]> {
    const supabase = supabaseClient || this.supabase;
    const { data: libres } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("status", "activa")
      .is("end_date", null);
    return (libres || []).map((l) => l.user_id);
  }
}

export const pagosService = new PagosService();

// Backward compatibility aliases
export type DetallePagoInput = PaymentDetailInput;
export type CreatePagoInput = CreatePaymentInput;
