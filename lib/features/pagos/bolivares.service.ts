import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { messages } from "@/lib/messages";
import { calcularMontoInscripcionAprobado, precioInscripcionActual } from "./inscription-amount";
import type { Pago, PaymentBolivar, PaymentDetail, TipoPago } from "@/lib/types";
import { estaCubierto, restanteUsd, type DetalleInput } from "./domain/bolivares";
import { distribuirSecuencial } from "./domain/cobertura";
import { canonicalizarBanco } from "./domain/bancos";
import { validarMetodoUnicoPorMes } from "./metodo-mes";

/**
 * BolivaresService — flujo de pago en bolívares (payment_bolivares).
 *
 * PROPIO DE ESTE FLUJO (no toca el proceso de efectivo):
 * 1. Crear: payments(pendiente) + payment_detail (payment_amount = amount_usd)
 *    + payment_bolivares 1:1 por cada detalle, con snapshot de la tasa BCV vigente
 *    y una imagen en `comprobantes/payments/<payment_id>/comprobante.<ext>`.
 * 2. Conciliar (solo super_admin, desde el módulo Pagos): marca
 *    payment_bolivares.reconciled = true. Eso NO aprueba el pago por sí solo.
 * 3. Aprobar: solo si para CADA (mes, año, tipo) del pago la SUMA de amount_usd
 *    de TODOS los payment_bolivares reconciliados de ese grupo es >= el monto
 *    mensual/inscripción configurado. Si algún grupo falta, el pago queda
 *    pendiente (pago parcial) y se conserva la imagen para la siguiente conciliación.
 * 4. Al aprobar (o rechazar/eliminar): se borran las imágenes del Storage para
 *    no acumular basura. `limpiarImagenesHuerfanas()` barre huérfanos.
 *
 * El monto en USD de payment_detail.payment_amount SIEMPRE es igual al amount_usd
 * de su fila payment_bolivares (regla de integridad 1:1).
 */

const BUCKET = "comprobantes";
/** Carpeta de imágenes de pagos BS: payments/<payment_id>/comprobante.<ext>. */
const CARPETA_PAGOS = "payments";
/** Extensión por defecto si el File no trae tipo claro. */
const EXT_DEFECTO = "jpg";

export interface CrearPagoBolivarInput {
  user_id: string;
  /** Detalles esperados (mes/año/tipo + monto esperado USD de config, solo para repartir). */
  detalles: DetalleInput[];
  /** Total pagado en bolívares (lo que dice el comprobante). */
  amount_bs: number;
  bank?: string;
  reference_number?: string;
  /** Imagen del comprobante (ya comprimida en el cliente). Se sube tras crear el pago. */
  comprobante?: File | null;
  payment_note?: string;
  /** Fecha de pago reportada (ISO date). */
  paid_at?: string;
}

export interface ResultadoReconciliacion {
  /** true si el pago quedó en "aprobado" (todos los grupos cubiertos). */
  aprobado: boolean;
  /** Monto USD que falta por cubrir (0 si aprobado). */
  restanteUsd: number;
  /** Detalle por grupo de lo que falta (para mostrar en la UI). */
  faltantes: Array<{
    month_number: number | null;
    year_number: number | null;
    payment_type: TipoPago;
    montoEsperadoUsd: number;
    sumaReconciliadaUsd: number;
    restante: number;
  }>;
}

export class BolivaresService {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── Tasa BCV vigente ──────────────────────────────────────────────────────

  /**
   * Último registro de exchange_rates con effective_at <= now (snapshot al crear).
   * Lanza si no hay tasa: el pago BS no puede registrarse sin ella.
   */
  async obtenerTasaVigente(): Promise<number> {
    const ahora = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("exchange_rates")
      .select("rate_bs")
      .lte("effective_at", ahora)
      .order("effective_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const tasa = data?.rate_bs != null ? Number(data.rate_bs) : 0;
    if (!(tasa > 0)) throw new Error(messages.bolivares.sinTasa);
    return tasa;
  }

  // ── Crear pago BS ─────────────────────────────────────────────────────────

  /**
   * Crea un pago en bolívares:
   * - Obtiene la tasa BCV vigente (snapshot).
   * - amount_usd = amount_bs / rate; se reparte entre los detalles.
   * - Inserta payments(pendiente) → payment_detail → payment_bolivares (1:1).
   * - Sube la imagen a `payments/<payment_id>/comprobante.<ext>` (sobreescribe si
   *   el mismo pago ya tenía; un pago = una imagen).
   * Si falla tras crear el pago, hace rollback (borra payments → cascada).
   */
  async crearPago(input: CrearPagoBolivarInput): Promise<Pago> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error(messages.toast.noAutenticado);
    if (!input.detalles.length) throw new Error(messages.bolivares.detalleRequerido);
    if (!(input.amount_bs > 0)) throw new Error(messages.bolivares.montoBsRequerido);

    // Super-admin: el pago nace aprobado (sin conciliación).
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const isAdmin = profile?.role === "super_admin";

    // Validación de datos bancarios (defensa en backend, no solo UI).
    const banco = canonicalizarBanco(input.bank ?? "");
    if (!banco) throw new Error(messages.bolivares.bancoRequerido);
    const referencia = String(input.reference_number ?? "").trim();
    if (!/^\d{6,}$/.test(referencia)) {
      throw new Error(messages.bolivares.referenciaRequerida);
    }

    // Referencia bancaria única: no se puede registrar dos veces el mismo pago.
    const { data: duplicado } = await this.supabase
      .from("payments")
      .select("id")
      .eq("payment_method", "bs")
      .eq("bill_code", referencia)
      .limit(1);
    if (duplicado && duplicado.length > 0) {
      throw new Error(messages.bolivares.referenciaDuplicada);
    }

    // Un mes se completa con un solo método (el del primer pago del mes).
    await validarMetodoUnicoPorMes(this.supabase, input.user_id, "bs", input.detalles);

    const rateBcv = await this.obtenerTasaVigente();

    // Distribución secuencial EN BS (fuente de verdad: lo que transfirió el
    // miembro). Cada detalle trae su necesidad en USD; se convierte a Bs al
    // precio del método y se llena el mes más viejo primero. Así el monto en Bs
    // guardado es exactamente el ingresado (sin pérdida por redondeo USD↔Bs).
    const necesidadesBs = input.detalles.map(
      (d) => Math.round(Math.max(0, Number(d.payment_amount) || 0) * rateBcv * 100) / 100
    );
    const { aplicados: aplicadosBs } = distribuirSecuencial(
      input.amount_bs,
      necesidadesBs
    );
    const reparto = input.detalles
      .map((d, i) => {
        // eslint-disable-next-line security/detect-object-injection -- índice numérico de array controlado
        const amountBs = aplicadosBs[i] ?? 0;
        return {
          month_number: d.month_number,
          year_number: d.year_number,
          payment_type: d.payment_type,
          amount_bs: amountBs,
          amount_usd: Math.round((amountBs / rateBcv) * 100) / 100,
        };
      })
      .filter((r) => r.amount_bs > 0);
    if (!reparto.length) throw new Error(messages.bolivares.detalleRequerido);

    // Lo transferido es la fuente de verdad: si el reparto por fracciones deja
    // un residuo (redondeo del precio en USD→Bs o redondeo del miembro), se
    // suma al último detalle. Así `payment_bolivares.amount_bs` suma EXACTO el
    // monto en Bs ingresado, sin conversiones de vuelta.
    const asignadoBs = reparto.reduce((total, r) => total + r.amount_bs, 0);
    const residuo = Math.round((input.amount_bs - asignadoBs) * 100) / 100;
    if (residuo >= 0.01) {
      const ultimo = reparto[reparto.length - 1];
      ultimo.amount_bs = Math.round((ultimo.amount_bs + residuo) * 100) / 100;
      ultimo.amount_usd = Math.round((ultimo.amount_bs / rateBcv) * 100) / 100;
    }

    // Precio congelado por método (snapshot) para cada detalle.
    const { data: metodos } = await this.supabase
      .from("gym_config_payment_methods")
      .select("payment_method, amount_monthly, amount_inscription")
      .eq("is_active", true);
    const cfg =
      (metodos || []).find((m) => m.payment_method === "bs") ||
      (metodos || []).find((m) => m.payment_method === "efectivo");
    const precioMensual = Number(cfg?.amount_monthly ?? 0);
    const precioInscripcion = Number(cfg?.amount_inscription ?? 0);

    // 1) Cabecera — pendiente para el miembro; aprobada de una vez para el super-admin.
    const { data: pago, error: pagoError } = await this.supabase
      .from("payments")
      .insert({
        user_id: input.user_id,
        status: isAdmin ? "aprobado" : "pendiente",
        payment_method: "bs",
        bill_code: referencia,
        receipt_url: null, // la imagen vive en payment_bolivares.image_url
        payment_note: input.payment_note || null,
        created_by: user.id,
        ...(isAdmin
          ? { approved_by: user.id, approved_at: new Date().toISOString() }
          : {}),
      })
      .select()
      .single();
    if (pagoError || !pago) {
      const mensaje = pagoError?.message ?? "";
      const esDuplicada =
        (pagoError as { code?: string } | null)?.code === "23505" ||
        /duplicate key|idx_payments_bs_referencia_unica/i.test(mensaje);
      throw new Error(
        esDuplicada ? messages.bolivares.referenciaDuplicada : mensaje || messages.toast.pagoError
      );
    }

    // Fuera del try: el catch de rollback necesita ver estas rutas si la subida
    // o el insert de bolivares fallan después de subir la imagen.
    let imageUrl: string | null = null;
    let imageFilename: string | null = null;

    try {
      // 2) Detalles — payment_amount SIEMPRE en USD (= amount_usd del bolivar).
      const detallesInsert = reparto.map((r) => ({
        payment_id: pago.id,
        month_number: r.month_number,
        year_number: r.year_number,
        payment_type: r.payment_type,
        payment_amount: r.amount_usd,
        expected_amount_usd:
          r.payment_type === "inscripcion" ? precioInscripcion : precioMensual,
      }));
      const { data: detallesCreados, error: detError } = await this.supabase
        .from("payment_detail")
        .insert(detallesInsert)
        .select("id, month_number, year_number, payment_type, payment_amount");
      if (detError || !detallesCreados?.length) {
        throw new Error(detError?.message || messages.toast.pagoError);
      }

      // 3) Imagen — una por pago, ruta predecible para borrado limpio.
      if (input.comprobante) {
        const subida = await this.subirComprobante(pago.id, input.comprobante);
        imageUrl = subida.path;
        imageFilename = input.comprobante.name;
      }

      // 4) payment_bolivares 1:1 con cada payment_detail (solo pagos BS).
      const bolivaresInsert = detallesCreados.map((det, i) => {
        // eslint-disable-next-line security/detect-object-injection -- índice numérico de array controlado
        const r = reparto[i] ?? reparto[reparto.length - 1];
        return {
          payment_id: pago.id,
          payment_detail_id: det.id,
          amount_bs: r.amount_bs,
          rate_bcv: rateBcv,
          amount_usd: r.amount_usd,
          bank: banco,
          reference_number: referencia,
          reconciled: isAdmin,
          paid_at: input.paid_at || new Date().toISOString().split("T")[0],
          image_url: imageUrl,
          image_filename: imageFilename,
          created_by: user.id,
        };
      });
      const { error: bolError } = await this.supabase
        .from("payment_bolivares")
        .insert(bolivaresInsert);
      if (bolError) throw new Error(bolError.message);

      return {
        ...pago,
        detail: detallesCreados as PaymentDetail[],
      };
    } catch (err) {
      // Rollback: CASCADE borra payment_detail y payment_bolivares.
      await this.supabase.from("payments").delete().eq("id", pago.id);
      if (imageUrl) await this.borrarImagenes([imageUrl]).catch(() => {});
      throw err;
    }
  }

  /** Sube (o sobreescribe) la imagen del pago en payments/<payment_id>/comprobante.<ext>. */
  private async subirComprobante(
    paymentId: string,
    file: File
  ): Promise<{ path: string }> {
    const ext = EXT_DE(file);
    const path = `${CARPETA_PAGOS}/${paymentId}/comprobante.${ext}`;
    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (error) throw new Error(error.message);
    return { path };
  }

  // ── Lectura ───────────────────────────────────────────────────────────────

  /** payment_bolivares de un pago (para el modal Detalle / conciliación). */
  async obtenerDePago(
    paymentId: string,
    supabaseClient?: SupabaseClient
  ): Promise<PaymentBolivar[]> {
    const sb = supabaseClient || this.supabase;
    const { data, error } = await sb
      .from("payment_bolivares")
      .select("*")
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as PaymentBolivar[]) || [];
  }

  /**
   * URL firmada (bucket privado) para ver la imagen del comprobante.
   * `path` es el valor guardado en image_url (no una URL pública).
   */
  async firmarImagen(
    path: string,
    supabaseClient?: SupabaseClient
  ): Promise<string | null> {
    if (!path) return null;
    const sb = supabaseClient || this.supabase;
    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  // ── Conciliación / aprobación ─────────────────────────────────────────────

  /**
   * Concilia un pago BS desde el módulo Pagos (super_admin):
   * 1. Marca reconciled=true en TODOS los payment_bolivares del pago.
   * 2. Para cada grupo (mes, año, tipo) del pago, suma amount_usd de TODOS los
   *    payment_bolivares reconciliados de ese usuario en ese grupo (incluye
   *    pagos parciales anteriores del mismo mes).
   * 3. Si TODOS los grupos están cubiertos (suma >= monto configurado):
   *    - payments.status = "aprobado"
   *    - actualiza profiles.inscripcion_pagada si hay inscripción
   *    - borra las imágenes del Storage (ya no sirven)
   *    - además aprueba cualquier OTRO pago pendiente del mismo miembro cuyos
   *      grupos estén ahora todos cubiertos (pagos parciales previos)
   * 4. El mes puede quedar parcial: se devuelve el restante para la UI, pero el
   *    pago queda aprobado (el dinero ya fue confirmado por el super-admin).
   */
  async reconciliarPago(pagoId: string): Promise<ResultadoReconciliacion> {
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

    const { data: pago } = await this.supabase
      .from("payments")
      .select("id, user_id, status, payment_method")
      .eq("id", pagoId)
      .single();
    if (!pago) throw new Error(messages.bolivares.pagoNoEncontrado);
    if (pago.payment_method !== "bs") {
      throw new Error(messages.bolivares.noEsPagoBs);
    }

    // 1) Marcar reconciliados los bolivares de ESTE pago.
    const { error: recError } = await this.supabase
      .from("payment_bolivares")
      .update({ reconciled: true })
      .eq("payment_id", pagoId);
    if (recError) throw new Error(recError.message);

    // 2) Cobertura de los grupos del pago (informativa: el mes puede quedar
    //    parcial). El super-admin confirma el dinero, así que el pago se
    //    aprueba SIEMPRE; la cobertura del mes se calcula por fracciones.
    const faltantes = await this.evaluarCoberturaPago(pagoId, pago.user_id);
    const restanteTotal = faltantes.reduce((s, f) => s + f.restante, 0);

    await this.aprobarInterno(pagoId, pago.user_id, user.id);
    // Pagos parciales previos del mismo miembro que ahora quedaron cubiertos.
    await this.aprobarPendientesCubiertos(pagoId, pago.user_id, user.id);
    // Borrar imágenes de ESTE pago (ya aprobado).
    await this.borrarImagenesDePago(pagoId);

    return {
      aprobado: true,
      restanteUsd: Math.round(restanteTotal * 100) / 100,
      faltantes,
    };
  }

  /**
   * Para cada detalle del pago, calcula suma reconciliada del grupo
   * (month, year, type) entre TODOS los bolivares reconciliados del usuario
   * y devuelve solo los grupos NO cubiertos.
   */
  private async evaluarCoberturaPago(
    pagoId: string,
    userId: string
  ): Promise<ResultadoReconciliacion["faltantes"]> {
    const { data: detalles } = await this.supabase
      .from("payment_detail")
      .select("month_number, year_number, payment_type, payment_amount")
      .eq("payment_id", pagoId);
    if (!detalles?.length) return [];

    // Montos configurados (USD) por tipo — fallback a efectivo si no hay BS activo.
    const { data: metodos } = await this.supabase
      .from("gym_config_payment_methods")
      .select("payment_method, amount_monthly, amount_inscription, is_active")
      .eq("is_active", true);
    const cfgBs = (metodos || []).find((m) => m.payment_method === "bs");
    const cfgEfectivo = (metodos || []).find((m) => m.payment_method === "efectivo");
    const cfg = cfgBs || cfgEfectivo;
    const montoMensual = Number(cfg?.amount_monthly || 0);
    const montoInscripcion = Number(
      (cfg as { amount_inscription?: number } | undefined)?.amount_inscription || 0
    );

    // Sumas reconciliadas por grupo (mes, año, tipo) para este usuario.
    // PostgREST devuelve los FK embebidos como objeto o array según cardinalidad;
    // normalizamos a objeto para leer month/year/tipo.
    const { data: reconciliados } = await this.supabase
      .from("payment_bolivares")
      .select(
        `amount_usd,
         payment_detail!inner(month_number, year_number, payment_type),
         payments!inner(user_id, status)`
      )
      .eq("reconciled", true)
      .eq("payments.user_id", userId);

    type FilaReconciliada = {
      amount_usd: number;
      payment_detail:
        | { month_number: number | null; year_number: number | null; payment_type: TipoPago }
        | Array<{ month_number: number | null; year_number: number | null; payment_type: TipoPago }>;
    };

    const sumas = new Map<string, number>();
    for (const row of ((reconciliados || []) as FilaReconciliada[])) {
      const d = Array.isArray(row.payment_detail) ? row.payment_detail[0] : row.payment_detail;
      if (!d) continue;
      const key = `${d.month_number ?? ""}|${d.year_number ?? ""}|${d.payment_type}`;
      sumas.set(key, (sumas.get(key) || 0) + Number(row.amount_usd || 0));
    }

    const faltantes: ResultadoReconciliacion["faltantes"] = [];
    for (const det of detalles) {
      const key = `${det.month_number ?? ""}|${det.year_number ?? ""}|${det.payment_type}`;
      const suma = sumas.get(key) || 0;
      const esperado =
        det.payment_type === "inscripcion" ? montoInscripcion : montoMensual;
      // suspension y montos 0 siempre cubiertos
      if (estaCubierto({ montoEsperadoUsd: esperado, sumaReconciliadaUsd: suma })) {
        continue;
      }
      faltantes.push({
        month_number: det.month_number,
        year_number: det.year_number,
        payment_type: det.payment_type,
        montoEsperadoUsd: esperado,
        sumaReconciliadaUsd: Math.round(suma * 100) / 100,
        restante: restanteUsd({ montoEsperadoUsd: esperado, sumaReconciliadaUsd: suma }),
      });
    }
    return faltantes;
  }

  /** Aprueba el pago e inscripción (misma lógica que aprobarPago de efectivo). */
  private async aprobarInterno(
    pagoId: string,
    userId: string,
    adminId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from("payments")
      .update({
        status: "aprobado",
        approved_by: adminId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", pagoId);
    if (error) throw new Error(error.message);

    const { data: detalles } = await this.supabase
      .from("payment_detail")
      .select("payment_type")
      .eq("payment_id", pagoId);
    const tieneInscripcion = detalles?.some((d) => d.payment_type === "inscripcion");
    if (tieneInscripcion) {
      // Solo queda pagada si la suma aprobada cubre el precio configurado.
      const [montoInsc, precioInsc] = await Promise.all([
        calcularMontoInscripcionAprobado(this.supabase, userId),
        precioInscripcionActual(this.supabase, "bs"),
      ]);
      const cubierta = precioInsc <= 0 ? true : montoInsc + 1e-9 >= precioInsc;
      await this.supabase
        .from("profiles")
        .update({
          inscription_paid: cubierta,
          inscription_amount_paid: montoInsc,
          ...(cubierta ? { inscription_date: new Date().toISOString().split("T")[0] } : {}),
        })
        .eq("id", userId);
    }
  }

  /**
   * Tras aprobar `pagoId`, aprueba también otros pagos pendientes del mismo
   * miembro cuyos grupos (mes/año/tipo) estén ahora todos cubiertos
   * (pagos parciales anteriores del mismo mes).
   */
  private async aprobarPendientesCubiertos(
    pagoId: string,
    userId: string,
    adminId: string
  ): Promise<void> {
    const { data: pendientes } = await this.supabase
      .from("payments")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pendiente")
      .eq("payment_method", "bs")
      .neq("id", pagoId);
    if (!pendientes?.length) return;

    for (const p of pendientes) {
      const faltantes = await this.evaluarCoberturaPago(p.id, userId);
      if (faltantes.length === 0) {
        await this.aprobarInterno(p.id, userId, adminId);
        await this.borrarImagenesDePago(p.id);
      }
    }
  }

  // ── Imágenes: borrado y limpieza ──────────────────────────────────────────

  /** Borra rutas del bucket (paths de image_url). Falla silencioso (best-effort). */
  async borrarImagenes(paths: string[]): Promise<void> {
    const limpias = [...new Set(paths.filter(Boolean))];
    if (!limpias.length) return;
    await this.supabase.storage.from(BUCKET).remove(limpias);
  }

  /** Borra todas las imágenes asociadas a un pago (payment_bolivares.image_url). */
  async borrarImagenesDePago(paymentId: string): Promise<void> {
    const { data } = await this.supabase
      .from("payment_bolivares")
      .select("image_url")
      .eq("payment_id", paymentId);
    const paths = (data || [])
      .map((r) => r.image_url as string | null)
      .filter((p): p is string => Boolean(p));
    await this.borrarImagenes(paths);
  }

  /**
   * Limpia imágenes huérfanas: archivos bajo `payments/` cuyo payment_id no
   * existe en payment_bolivares (pago borrado sin limpieza, subida a medias).
   * Best-effort, acotado a `limite` carpetas por llamada para no ser lento.
   * Devuelve cuántos archivos borró.
   */
  async limpiarImagenesHuerfanas(limite = 20): Promise<number> {
    const { data: carpetas, error } = await this.supabase.storage
      .from(BUCKET)
      .list(CARPETA_PAGOS, { limit: limite });
    if (error || !carpetas?.length) return 0;

    let borrados = 0;
    for (const item of carpetas) {
      // En Supabase Storage, las carpetas aparecen con id === null.
      if (item.id !== null && item.id !== undefined) continue;
      const paymentId = item.name;
      const { count } = await this.supabase
        .from("payment_bolivares")
        .select("id", { count: "exact", head: true })
        .eq("payment_id", paymentId);
      if ((count || 0) === 0) {
        const { data: archivos } = await this.supabase.storage
          .from(BUCKET)
          .list(`${CARPETA_PAGOS}/${paymentId}`);
        const paths = (archivos || []).map(
          (a) => `${CARPETA_PAGOS}/${paymentId}/${a.name}`
        );
        if (paths.length) {
          await this.borrarImagenes(paths);
          borrados += paths.length;
        }
      }
    }
    return borrados;
  }
}

/** Extensión segura del archivo (jpg por defecto). */
function EXT_DE(file: File): string {
  const tipo = (file.type || "").toLowerCase();
  if (tipo.includes("png")) return "png";
  if (tipo.includes("webp")) return "webp";
  if (tipo.includes("gif")) return "gif";
  if (tipo.includes("pdf")) return "pdf";
  const nombre = (file.name || "").toLowerCase().split(".").pop();
  if (nombre && /^[a-z0-9]{1,5}$/.test(nombre)) return nombre;
  return EXT_DEFECTO;
}

/**
 * Instancia lazy para la UI (browser client) — mismo patrón que `pagosService`:
 * en server/test se inyecta el client con `new BolivaresService(client)`.
 */
let instancia: BolivaresService | null = null;
function obtenerInstancia(): BolivaresService {
  if (!instancia) instancia = new BolivaresService(createBrowserClient());
  return instancia;
}

/**
 * API pública del módulo BS en la UI:
 *   bolivaresService.crearPago(...) / .reconciliarPago(...) / ...
 * (proxy a la instancia singleton lazy; no confundir con la clase.)
 */
export const bolivaresService: BolivaresService = new Proxy({} as BolivaresService, {
  get(_t, prop: string | symbol) {
    const inst = obtenerInstancia() as unknown as Record<string | symbol, unknown>;
    // eslint-disable-next-line security/detect-object-injection -- prop es string|symbol del Proxy de TypeScript
    const valor = inst[prop];
    return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(inst) : valor;
  },
});
