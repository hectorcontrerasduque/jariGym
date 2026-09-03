"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getMonthName, getDiaCobro } from "@/lib/utils";
import { CreditCard, CheckCircle, Clock, Calendar, Eye, Trash2, FileText, Plus, Search, Upload, Gift, AlertTriangle, ChevronDown, ChevronRight, X, Save, Home, Phone, Mail, MapPin } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { messages } from "@/lib/messages";
import { Avatar } from "@/components/ui/avatar";
import { Loader } from "@/components/ui/loader";
import type { Payment, Profile, MetodoPago, PaymentMethod, GymConfig } from "@/lib/types";

const metodoLabels: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  bs: "Bs",
  binance: "Binance",
};

function getPagoLabel(pago: Payment): string {
  const detalles = pago.detail || [];
  if (!detalles.length) return "Pago";
  if (detalles.some(d => d.payment_type === "inscripcion")) return "Inscripción";
  return "Mensualidad";
}

function isInscripcion(pago: Payment): boolean {
  return pago.detail?.some((d) => d.payment_type === "inscripcion") || false;
}

function getTipoLabel(pago: Payment): string {
  return isInscripcion(pago) ? "Inscripción" : "Mensualidad";
}

function getTotalMonto(pago: Payment): number {
  return pago.detail?.reduce((sum, d) => sum + d.payment_amount, 0) || 0;
}

function getPagoMesesInfo(pago: Payment): string {
  const detalles = pago.detail || [];
  if (!detalles.length) return "—";
  
  // Ordenar por year_number, month_number
  const sorted = detalles.sort(
    (a, b) => (a.year_number || 0) - (b.year_number || 0) || (a.month_number || 0) - (b.month_number || 0)
  );
  
  // Agrupar por tipo y formar cadena
  const parts: string[] = [];
  for (const d of sorted) {
    const mes = getMonthName(d.month_number ?? 0).slice(0, 3);
    const tipo = d.payment_type === "inscripcion" ? "Inscripción" : "Mensualidad";
    parts.push(`${mes} ${d.year_number} (${tipo})`);
  }
  
  return parts.join(" | ") || "—";
}

function MisPagosContent() {
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as "home" | "pagos") || "pagos";

  const [pagos, setPagos] = useState<Payment[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [gymConfig, setGymConfig] = useState<GymConfig | null>(null);
  const [homeAnioSeleccionado, setHomeAnioSeleccionado] = useState(new Date().getFullYear());

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "super_admin";

  // Super admin: member selector
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [miembroSearch, setMiembroSearch] = useState("");
  const [miembroSeleccionado, setMiembroSeleccionado] = useState<Profile | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  // Home expand toggles
  const [expandedPendientes, setExpandedPendientes] = useState(false);
  const [expandedMoroso, setExpandedMoroso] = useState(false);

  // Payment form
  const [selectedPago, setSelectedPago] = useState<Payment | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [metodosPago, setMetodosPago] = useState<PaymentMethod[]>([]);
  const [mesesPendientes, setMesesPendientes] = useState<{ month_number: number; year_number: number }[]>([]);
  const [inscripcionPagada, setInscripcionPagada] = useState(false);
  const [inscripcionPendiente, setInscripcionPendiente] = useState(false);
  const [membresiaLibre, setMembresiaLibre] = useState(false);
  const [savingPago, setSavingPago] = useState(false);
  const [loadingPendientes, setLoadingPendientes] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const msgConceptoRef = useRef<HTMLDivElement>(null);
  const msgMesesRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    meses: [] as { month_number: number; year_number: number }[],
    metodo_pago: "efectivo" as MetodoPago,
    codigo_billete: "",
    notas: "",
    pagar_inscripcion: false,
    pagar_mensualidad: false,
    solicitar_suspension: false,
    fecha_pago: new Date().toISOString().split("T")[0],
  });
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [showPagosRealizados, setShowPagosRealizados] = useState(true);

  const fetchMisPagosData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    setProfile(profileData);

    const targetId = miembroSeleccionado?.id || user.id;
    const currentIsAdmin = profileData?.role === "super_admin";

    // Individual queries with error handling - avoid Promise.all that fails entire page load
    let pagosData = [];
    let aniosData = [new Date().getFullYear()];
    let config: GymConfig | null = null;

    // 1. Cargar pagos
    try {
      if (currentIsAdmin) {
        const { data: pg, error: pgError } = await supabase
          .from("payments")
          .select("*, detail:payment_detail(*)")
          .eq("user_id", targetId)
          .order("created_at", { ascending: false });
        if (pgError) throw pgError;
        pagosData = pg || [];
      } else {
        const { data: pg, error: pgError } = await supabase
          .from("payments")
          .select("*, detail:payment_detail(*)")
          .eq("user_id", targetId)
          .order("created_at", { ascending: false });
        if (pgError) throw pgError;
        pagosData = pg || [];
      }
    } catch (err) {
      console.error("Error cargando pagos:", err);
      showToast(messages.toast.errorCargaDatos, "error");
    }

    // 2. Cargar años
    try {
      const { data: ad, error: adError } = await supabase
        .from("payments")
        .select("id");
      if (adError) throw adError;
      if (ad && ad.length > 0) {
        const { data: detalle } = await supabase
          .from("payment_detail")
          .select("year_number")
          .in("payment_id", ad.map((p) => p.id));
        const years = Array.from(new Set((detalle || []).map((d) => d.year_number).filter(Boolean)));
        aniosData = years.length > 0 ? years : [new Date().getFullYear()];
      }
    } catch (err) {
      console.error("Error cargando años:", err);
      aniosData = [new Date().getFullYear()];
    }

    // 3. Cargar config + métodos via API route
    try {
      const res = await fetch("/api/config/public");
      const { config: cfg, metodos } = await res.json();
      config = cfg;
      setMetodosPago(metodos);
    } catch {
      config = null;
    }

    setPagos(pagosData);
    setAnios(aniosData);
    setGymConfig(config);

    // 5. Cargar miembros (para distribucion por hora en Home)
    try {
      const { data: miembrosData } = await supabase
        .from("profiles")
        .select("*")
        .eq("activo", true)
        .eq("registered", true)
        .order("full_name");
      if (miembrosData) setMiembros(miembrosData);
    } catch (err) {
      console.error("Error cargando miembros:", err);
    }
  }, [miembroSeleccionado]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        await fetchMisPagosData();
      } catch {
        if (!cancelled) showToast(messages.toast.errorCargaDatos, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [fetchMisPagosData]);

  // Load pending months when member changes
  const loadMiembroPendientes = useCallback(async (miembroId: string, anio?: number) => {
    setLoadingPendientes(true);
    try {
      const [meses, profile, libre, tienePendiente] = await Promise.all([
        pagosService.mesesPendientesAdmin(miembroId, anio),
        createClient().from("profiles").select("inscription_paid").eq("id", miembroId).single(),
        createClient().from("memberships").select("id").eq("user_id", miembroId).eq("status", "activa").is("end_date", null).maybeSingle(),
        pagosService.tieneInscripcionPendiente(miembroId),
      ]);
      setMesesPendientes(meses);
      if (profile.data) setInscripcionPagada(profile.data.inscription_paid);
      setInscripcionPendiente(tienePendiente);
setMembresiaLibre(!!libre.data);
      setFormData(prev => ({ ...prev, meses: [], pagar_inscripcion: false, pagar_mensualidad: false }));
    } catch {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoadingPendientes(false);
    }
  }, []);  
    const loadSelfPendientes = useCallback(async (userId: string, anio?: number) => {
    setLoadingPendientes(true);
    try {
      const [meses, profile, libre, tienePendiente] = await Promise.all([
        pagosService.mesesPendientes(userId, anio),
        createClient().from("profiles").select("inscription_paid").eq("id", userId).single(),
        createClient().from("memberships").select("id").eq("user_id", userId).eq("status", "activa").is("end_date", null).maybeSingle(),
        pagosService.tieneInscripcionPendiente(userId),
      ]);
      setMesesPendientes(meses);
      if (profile.data) setInscripcionPagada(profile.data.inscription_paid);
      setInscripcionPendiente(tienePendiente);
setMembresiaLibre(!!libre.data);
      setFormData(prev => ({ ...prev, meses: [], pagar_inscripcion: false, pagar_mensualidad: false }));
    } catch {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoadingPendientes(false);
    }
  }, []);  
    useEffect(() => {
    if (!showForm) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      const targetId = miembroSeleccionado?.id || user.id;
      setLoadingPendientes(true);
      if (miembroSeleccionado) {
        loadMiembroPendientes(targetId, anioSeleccionado);
      } else {
        loadSelfPendientes(targetId, anioSeleccionado);
      }
    });
    return () => { cancelled = true; };
  }, [showForm, miembroSeleccionado, anioSeleccionado, loadMiembroPendientes, loadSelfPendientes]);

  const handleSelectMiembro = (m: Profile | null) => {
    setMiembroSeleccionado(m);
    setShowSearch(false);
    setMiembroSearch("");
    setFormData({ meses: [], metodo_pago: "efectivo", codigo_billete: "", notas: "", pagar_inscripcion: false, pagar_mensualidad: false, solicitar_suspension: false, fecha_pago: new Date().toISOString().split("T")[0] });
  };

  const toggleMonth = (month_number: number, year_number: number) => {
    setFormData(prev => {
      const existe = prev.meses.some(m => m.month_number === month_number && m.year_number === year_number);
      const source = prev.solicitar_suspension ? mesesParaSuspender : mesesDisponiblesParaPagar;
      if (existe) {
        const idx = source.findIndex(m => m.month_number === month_number && m.year_number === year_number);
        const nuevosMeses = prev.meses.filter(m => {
          const mIdx = source.findIndex(sp => sp.month_number === m.month_number && sp.year_number === m.year_number);
          return mIdx < idx;
        });
        return { ...prev, meses: nuevosMeses, pagar_mensualidad: nuevosMeses.length > 0 };
      } else {
        const idx = source.findIndex(m => m.month_number === month_number && m.year_number === year_number);
        const nuevosMeses = source.slice(0, idx + 1);
        return { ...prev, meses: nuevosMeses, pagar_mensualidad: !prev.solicitar_suspension && nuevosMeses.length > 0 };
      }
    });
  };

  const getMontoByMetodo = useCallback((metodo: MetodoPago, tipo: "mensual" | "inscripcion"): number => {
    const config = metodosPago.find(m => m.payment_method === metodo);
    if (!config || !config.is_active) {
      const def = metodosPago.find(m => m.payment_method === "efectivo");
      return tipo === "mensual" ? (def?.amount_monthly || 0) : (def?.amount_inscription || 0);
    }
    return tipo === "mensual" ? config.amount_monthly : config.amount_inscription;
  }, [metodosPago]);

  const montoTotal = useMemo(() => {
    let total = 0;
    if (formData.pagar_inscripcion && !inscripcionPagada && getMontoByMetodo(formData.metodo_pago, "inscripcion") > 0) {
      total += getMontoByMetodo(formData.metodo_pago, "inscripcion");
    }
    if (formData.pagar_mensualidad && formData.meses.length > 0) {
      total += formData.meses.length * getMontoByMetodo(formData.metodo_pago, "mensual");
    }
    return total;
  }, [formData, inscripcionPagada, getMontoByMetodo]);

  const needsComprobante = (metodo: MetodoPago) => metodo !== "efectivo";

  const handleSubmitPago = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    if (!formData.pagar_inscripcion && !formData.pagar_mensualidad && !formData.solicitar_suspension) {
      showToast("Selecciona un concepto de pago", "warning");
      setTimeout(() => msgConceptoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      return;
    }
    if ((formData.pagar_mensualidad || formData.solicitar_suspension) && formData.meses.length === 0) {
      showToast("Selecciona al menos un mes", "warning");
      setTimeout(() => msgMesesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      return;
    }
    if (!formData.solicitar_suspension && montoTotal === 0) {
      showToast("El monto a pagar es 0. Verifica los montos configurados", "warning");
      return;
    }

    const nombreMiembro = miembroSeleccionado?.full_name || profile?.full_name || "tu cuenta";
    const acciones: string[] = [];
    if (formData.solicitar_suspension) {
      const mesesStr = formData.meses.map(m => `${getMonthName(m.month_number)} ${m.year_number}`).join(", ");
      acciones.push(`Solicitar suspensión de: ${mesesStr}`);
    } else {
      if (formData.pagar_inscripcion) acciones.push(`Inscripción: ${formatCurrency(getMontoByMetodo(formData.metodo_pago, "inscripcion"))}`);
      if (formData.pagar_mensualidad && formData.meses.length > 0) {
        const mesesStr = formData.meses.map(m => `${getMonthName(m.month_number)} ${m.year_number}`).join(", ");
        acciones.push(`Mensualidad (${formData.meses.length} mes(es)): ${mesesStr} — Total: ${formatCurrency(montoTotal)}`);
      }
    }
    const metodoLabel = metodoLabels[formData.metodo_pago] || formData.metodo_pago;
    const confirmMsg = `Confirmar acción para ${nombreMiembro}:\n\n${acciones.join("\n")}\n\nMétodo de pago: ${metodoLabel}\n¿Continuar?`;
    if (!confirm(confirmMsg)) return;

    setSavingPago(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const targetId = miembroSeleccionado?.id || user.id;
      const isSelf = !miembroSeleccionado || miembroSeleccionado.id === user.id;

      // Handle suspension request
      if (formData.solicitar_suspension) {
        if (formData.meses.length === 0) {
          throw new Error("Selecciona al menos un mes para solicitar suspensión");
        }
        await pagosService.crearPagoSuspendido(targetId, formData.meses, formData.notas || undefined, isSuperAdmin ? "suspendido" : "pendiente");
        showToast(messages.misPagos.solicitudEnviada, "success");
        setFormData({ meses: [], metodo_pago: "efectivo", codigo_billete: "", notas: "", pagar_inscripcion: false, pagar_mensualidad: false, solicitar_suspension: false, fecha_pago: new Date().toISOString().split("T")[0] });
        await fetchMisPagosData();
        await reloadPendientes();
        return;
      }

      if (!formData.pagar_inscripcion && !formData.pagar_mensualidad) {
        throw new Error("Selecciona al menos inscripción o mensualidad");
      }
      if (formData.pagar_mensualidad && formData.meses.length === 0) {
        throw new Error("Selecciona al menos un mes");
      }

      let comprobanteUrl = "";
      if (needsComprobante(formData.metodo_pago) && comprobante) {
        const fileName = `${targetId}/${crypto.randomUUID()}_${comprobante.name}`;
        const { error: uploadError } = await supabase.storage.from("comprobantes").upload(fileName, comprobante);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("comprobantes").getPublicUrl(fileName);
        comprobanteUrl = urlData.publicUrl;
      }

      const useAutoApprove = isSelf && isAdmin;

      const detalles: Array<{ month_number: number | null; year_number: number | null; payment_type: "mensualidad" | "inscripcion"; payment_amount: number }> = [];

      if (formData.pagar_inscripcion && !inscripcionPagada && getMontoByMetodo(formData.metodo_pago, "inscripcion") > 0) {
        detalles.push({
          month_number: new Date().getMonth() + 1,
          year_number: new Date().getFullYear(),
          payment_type: "inscripcion",
          payment_amount: getMontoByMetodo(formData.metodo_pago, "inscripcion"),
        });
      }

      if (formData.pagar_mensualidad && formData.meses.length > 0) {
        for (const { month_number, year_number } of formData.meses) {
          detalles.push({
            month_number,
            year_number,
            payment_type: "mensualidad",
            payment_amount: getMontoByMetodo(formData.metodo_pago, "mensual"),
          });
        }
      }

      if (detalles.length === 0) {
        throw new Error("Selecciona al menos un concepto de pago");
      }

      const pagoInput = {
        user_id: targetId,
        payment_method: formData.metodo_pago,
        receipt_url: comprobanteUrl || undefined,
        bill_code: formData.codigo_billete || undefined,
        payment_note: formData.pagar_inscripcion && !inscripcionPagada ? "Inscripción" : formData.notas || undefined,
        detalles,
      };

      if (useAutoApprove) {
        await pagosService.crearPagoAprobado(pagoInput);
      } else {
        await pagosService.crearPago(pagoInput);
      }

      showToast(isSelf ? "Pago registrado y aprobado" : "Pago registrado (pendiente de aprobación)", "success");
      setFormData({ meses: [], metodo_pago: "efectivo", codigo_billete: "", notas: "", pagar_inscripcion: false, pagar_mensualidad: false, solicitar_suspension: false, fecha_pago: new Date().toISOString().split("T")[0] });
      setComprobante(null);
      setSubmitted(false);
      await fetchMisPagosData();
      await reloadPendientes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrar pago";
      showToast(msg, "error");
    } finally {
      setSavingPago(false);
    }
  };

  const reloadPendientes = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const targetId = miembroSeleccionado?.id || user.id;
      if (miembroSeleccionado) {
        await loadMiembroPendientes(targetId, anioSeleccionado);
      } else {
        await loadSelfPendientes(targetId, anioSeleccionado);
      }
    } catch {}
  }, [miembroSeleccionado, anioSeleccionado, loadMiembroPendientes, loadSelfPendientes]);

  const handleDelete = async (pagoId: string) => {
    if (!confirm(messages.pagos.eliminarPagoConfirm)) return;
    setDeleting(pagoId);
    try {
      await pagosService.eliminarPago(pagoId);
      showToast(messages.toast.pagoEliminado, "success");
      await fetchMisPagosData();
      await reloadPendientes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : messages.toast.pagoEliminadoError;
      showToast(msg, "error");
    } finally {
      setDeleting(null);
    }
  };

  const pagosOrdenados = useMemo(() => {
    return [...pagos].sort((a, b) => {
      const aMax = a.detail?.reduce((max, d) => {
        const key = (d.year_number || 0) * 100 + (d.month_number || 0);
        return key > max ? key : max;
      }, 0) || 0;
      const bMax = b.detail?.reduce((max, d) => {
        const key = (d.year_number || 0) * 100 + (d.month_number || 0);
        return key > max ? key : max;
      }, 0) || 0;
      return bMax - aMax;
    });
  }, [pagos]);

  const aprobados = pagos.filter(p => p.status === "aprobado");
  const pendientes = pagos.filter(p => p.status === "pendiente");
  const montoAprobado = aprobados.reduce((sum, p) => sum + (p.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0), 0);
  const montoPendiente = pendientes.reduce((sum, p) => sum + (p.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0), 0);

  // Home tab: filtered by year
  const pagosHome = useMemo(() => {
    return pagos.filter(p => {
      const hasDetailInYear = p.detail?.some(d => d.year_number === homeAnioSeleccionado);
      return hasDetailInYear;
    });
  }, [pagos, homeAnioSeleccionado]);

  const aprobadosHome = pagosHome.filter(p => p.status === "aprobado");
  const aprobadosMensualidad = aprobadosHome.filter(p => p.detail?.some(d => d.payment_type === "mensualidad"));
  const aprobadosInscripcion = aprobadosHome.filter(p => p.detail?.some(d => d.payment_type === "inscripcion"));
  const montoAprobadoMensualidad = aprobadosMensualidad.reduce((sum, p) => sum + (p.detail?.filter(d => d.payment_type === "mensualidad").reduce((s, d) => s + d.payment_amount, 0) || 0), 0);
  const montoAprobadoInscripcion = aprobadosInscripcion.reduce((sum, p) => sum + (p.detail?.filter(d => d.payment_type === "inscripcion").reduce((s, d) => s + d.payment_amount, 0) || 0), 0);

  const pendientesHome = pagosHome.filter(p => p.status === "pendiente" || p.status === "suspendido_pendiente");
  const totalPendientesHome = pendientesHome.reduce((sum, p) => sum + (p.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0), 0);

  const rechazadosSuspensosHome = pagosHome.filter(p => p.status === "rechazado" || p.status === "suspendido");
  const totalRechazadosSuspensosHome = rechazadosSuspensosHome.reduce((sum, p) => sum + (p.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0), 0);

  // Morosidad (client-side)
  const morosidad = useMemo(() => {
    if (!profile?.start_date || !gymConfig) return null;
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();
    const modoCobro = (gymConfig.billing_mode as "dia_uno" | "fecha_inscripcion") || "dia_uno";

    const parts = profile.start_date.split("-").map(Number);
    let mesDeuda = parts[1] + 1;
    let anioDeuda = parts[0];
    if (mesDeuda > 12) { mesDeuda = 1; anioDeuda++; }
    if (anioDeuda > anioActual) return null;
    const primerMesDeuda = anioDeuda === anioActual ? mesDeuda : 1;

    const mesesCubiertos = new Set(
      pagos
        .filter(p => p.status === "aprobado" || p.status === "suspendido")
        .flatMap(p => (p.detail || [])
          .filter(d => d.payment_type === "mensualidad" && d.year_number === anioActual)
          .map(d => d.month_number!))
    );

    const mesesDeuda: number[] = [];
    for (let mes = primerMesDeuda; mes <= mesActual; mes++) {
      if (mesesCubiertos.has(mes)) continue;
      const diaCobro = getDiaCobro(profile.start_date, mes, anioActual, modoCobro);
      if (mes === mesActual && hoy.getDate() < diaCobro) continue;
      mesesDeuda.push(mes);
    }

    const debeInscripcion = !profile.inscription_paid;
    const activeMetodo = metodosPago.find(m => m.is_active);
    const montoMensual = activeMetodo?.amount_monthly || 0;
    const montoInscripcion = activeMetodo?.amount_inscription || 0;
    const totalDeuda = mesesDeuda.length * montoMensual + (debeInscripcion ? montoInscripcion : 0);

    if (!debeInscripcion && mesesDeuda.length === 0) return null;
    return { mesesDeuda, debeInscripcion, totalDeuda, montoMensual, montoInscripcion, anioActual };
  }, [profile, gymConfig, pagos, metodosPago]);

  const filteredMiembros = miembros.filter(m => {
    const s = miembroSearch.toLowerCase();
    return m.full_name?.toLowerCase().includes(s) || m.email?.toLowerCase().includes(s);
  });

  const showInscriptionCheckbox = !inscripcionPagada && !inscripcionPendiente && gymConfig && getMontoByMetodo(formData.metodo_pago, "inscripcion") > 0;

  const mesesDisponiblesParaPagar = (() => {
    const mesesConPago = new Set(
      pagos
        .filter(p => {
          if (isSuperAdmin && miembroSeleccionado) {
            return p.status === "pendiente" || p.status === "aprobado" || p.status === "suspendido";
          }
          return p.status === "pendiente" || p.status === "aprobado" || p.status === "suspendido";
        })
        .flatMap(p => (p.detail || []).map(d => d.month_number && d.year_number ? `${d.year_number}-${d.month_number}` : null))
        .filter(Boolean)
    );
    return mesesPendientes.filter(m => !mesesConPago.has(`${m.year_number}-${m.month_number}`));
  })();

  const mesesParaSuspender = [...mesesDisponiblesParaPagar].sort((a, b) => a.year_number - b.year_number || a.month_number - b.month_number);

  if (loading) {
    return <Loader show={true} />;
  }

  return (
    <>
    <div className="space-y-4 animate-fadeIn">
      <Loader show={savingPago || !!deleting} message={savingPago ? messages.common.guardando : messages.common.eliminando} variant="overlay" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">{activeTab === "home" ? "Home" : "Mis Pagos"}</h1>
          <p className="text-gym-muted text-sm">
            {activeTab === "home" ? "Resumen de tu cuenta" : miembroSeleccionado ? `Pagos de ${miembroSeleccionado.full_name || miembroSeleccionado.email}` : "Historial y registro de pagos"}
          </p>
        </div>
        {activeTab === "pagos" && (
          <div className="flex items-center gap-2">
            <select
              value={anioSeleccionado}
              onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
              className="px-4 py-2 bg-gym-surface border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary"
            >
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Super Admin: member selector */}
      {isSuperAdmin && (
        <Card className="neon-card relative z-30">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              {miembroSeleccionado ? (
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar src={miembroSeleccionado.avatar_url} alt={miembroSeleccionado.full_name || ""} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gym-text truncate">{miembroSeleccionado.full_name || miembroSeleccionado.email}</p>
                    <p className="text-xs text-gym-muted truncate">{miembroSeleccionado.email}</p>
                  </div>
                  <button
                    onClick={() => handleSelectMiembro(null)}
                    className="p-1.5 text-gym-muted hover:text-gym-danger hover:bg-gym-danger/10 rounded-lg transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : showSearch ? (
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-muted" />
                  <input
                    type="text"
                    placeholder="Buscar miembro..."
                    value={miembroSearch}
                    onChange={(e) => setMiembroSearch(e.target.value)}
                    onFocus={() => setShowSearch(true)}
                    autoFocus
                    className="w-full pl-9 pr-3 py-2 bg-gym-bg border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary"
                  />
                  {miembroSearch && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-gym-bg border border-gym-border rounded-xl z-50 shadow-lg">
                      {filteredMiembros.length === 0 ? (
                        <p className="p-3 text-sm text-gym-muted">Sin resultados</p>
                      ) : (
                        filteredMiembros.map(m => (
                          <button
                            key={m.id}
                            onClick={() => { handleSelectMiembro(m); setShowSearch(false); }}
                            className="w-full text-left p-3 hover:bg-gym-surface transition-colors border-b border-gym-border/30 last:border-0 flex items-center gap-3"
                          >
                            <Avatar src={m.avatar_url} alt={m.full_name || ""} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gym-text truncate">{m.full_name || "Sin nombre"}</p>
                              <p className="text-xs text-gym-muted truncate">{m.email}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar src={profile?.avatar_url} alt={profile?.full_name || ""} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gym-text truncate">{profile?.full_name || "Miembro"}</p>
                    <p className="text-xs text-gym-muted">Registrando pago para este usuario</p>
                  </div>
                  <button
                    onClick={() => setShowSearch(true)}
                    className="text-xs text-gym-primary hover:underline flex-shrink-0"
                  >
                    Cambiar
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Home tab - miembro */}
      {!isSuperAdmin && activeTab === "home" && (
        <div className="space-y-4">
          {/* Hero banner */}
          <div className="relative overflow-hidden rounded-2xl border border-gym-primary/20 bg-gradient-to-br from-gym-primary/15 via-gym-surface to-gym-secondary/10 p-6">
            <div className="absolute -right-8 -top-8 w-40 h-40 bg-gym-primary/10 rounded-full blur-3xl" />
            <div className="absolute -left-6 -bottom-6 w-32 h-32 bg-gym-secondary/10 rounded-full blur-3xl" />
            <div className="absolute top-3 right-8 w-2 h-2 bg-gym-primary rounded-full animate-float" />
            <div className="absolute top-6 right-16 w-1.5 h-1.5 bg-gym-secondary rounded-full animate-float" style={{ animationDelay: "0.5s" }} />
            <div className="absolute bottom-4 right-12 w-1 h-1 bg-gym-primary rounded-full animate-float" style={{ animationDelay: "1s" }} />
            <div className="relative z-10">
              <p className="text-gym-primary text-xs font-medium tracking-widest uppercase mb-1">Bienvenido a</p>
              <h2 className="text-2xl font-display font-bold text-gym-text neon-text">{gymConfig?.gym_name || "tu gimnasio"}</h2>
              <p className="text-gym-muted text-sm mt-1">{profile?.full_name || "Miembro"}</p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gym-muted font-medium uppercase tracking-wide">Resumen</span>
            <select
              value={homeAnioSeleccionado}
              onChange={(e) => setHomeAnioSeleccionado(Number(e.target.value))}
              className="text-xs bg-gym-bg border border-gym-border rounded-lg px-2 py-1 text-gym-text"
            >
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Card 1: Pagos aprobados */}
          <div className="rounded-xl border border-gym-border bg-gym-surface p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-gym-success" />
                <span className="text-xs font-medium text-gym-muted uppercase tracking-wide">Pagos</span>
              </div>
              <span className="text-lg font-bold text-gym-success">{aprobadosHome.length}</span>
            </div>
            <div className="space-y-1.5">
              {aprobadosMensualidad.length > 0 && (
                <div className="flex items-center justify-between px-2 py-1.5 bg-gym-bg/60 rounded-lg">
                  <span className="text-xs text-gym-muted">Mensualidad ({aprobadosMensualidad.length})</span>
                  <span className="text-xs font-semibold text-gym-success">{formatCurrency(montoAprobadoMensualidad)}</span>
                </div>
              )}
              {aprobadosInscripcion.length > 0 && (
                <div className="flex items-center justify-between px-2 py-1.5 bg-gym-bg/60 rounded-lg">
                  <span className="text-xs text-gym-muted">Inscripción ({aprobadosInscripcion.length})</span>
                  <span className="text-xs font-semibold text-gym-success">{formatCurrency(montoAprobadoInscripcion)}</span>
                </div>
              )}
              {aprobadosHome.length === 0 && (
                <p className="text-xs text-gym-muted text-center py-1">Sin pagos aprobados este año</p>
              )}
            </div>
          </div>

          {/* Card 2: Pendientes */}
          <div className="rounded-xl border border-gym-border bg-gym-surface p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gym-warning" />
                <span className="text-xs font-medium text-gym-muted uppercase tracking-wide">Pendientes</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-gym-warning">{pendientesHome.length}</span>
                {totalPendientesHome > 0 && (
                  <p className="text-[10px] text-gym-warning">{formatCurrency(totalPendientesHome)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Card 3: Suspendidos / Rechazados */}
          {rechazadosSuspensosHome.length > 0 && (
            <div className="rounded-xl border border-gym-border bg-gym-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-gym-danger" />
                  <span className="text-xs font-medium text-gym-muted uppercase tracking-wide">Suspendidos / Rechazados</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-gym-danger">{rechazadosSuspensosHome.length}</span>
                  {totalRechazadosSuspensosHome > 0 && (
                    <p className="text-[10px] text-gym-danger">{formatCurrency(totalRechazadosSuspensosHome)}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                {rechazadosSuspensosHome.filter(p => p.status === "rechazado").length > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 bg-gym-bg/60 rounded-lg">
                    <span className="text-xs text-gym-muted">Rechazados ({rechazadosSuspensosHome.filter(p => p.status === "rechazado").length})</span>
                    <span className="text-xs font-semibold text-gym-danger">
                      {formatCurrency(rechazadosSuspensosHome.filter(p => p.status === "rechazado").reduce((sum, p) => sum + (p.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0), 0))}
                    </span>
                  </div>
                )}
                {rechazadosSuspensosHome.filter(p => p.status === "suspendido").length > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 bg-gym-bg/60 rounded-lg">
                    <span className="text-xs text-gym-muted">Suspendidos ({rechazadosSuspensosHome.filter(p => p.status === "suspendido").length})</span>
                    <span className="text-xs font-semibold text-gym-danger">
                      {formatCurrency(rechazadosSuspensosHome.filter(p => p.status === "suspendido").reduce((sum, p) => sum + (p.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0), 0))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Info del gym */}
          {gymConfig && (gymConfig.schedule || gymConfig.phone_number || gymConfig.contact_email || gymConfig.address) && (
            <Card className="neon-card overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 to-transparent pointer-events-none" />
              <CardHeader className="pb-2 relative">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <div className="w-7 h-7 rounded-lg bg-gym-primary/15 flex items-center justify-center">
                    <Home className="w-4 h-4 text-gym-primary" />
                  </div>
                  {gymConfig.gym_name || "Información del Gimnasio"}
                </CardTitle>
              </CardHeader>
              <CardContent className="relative space-y-2">
                {gymConfig.schedule && (
                  <div className="flex items-center gap-3 p-2.5 bg-gym-bg/60 rounded-xl">
                    <Clock className="w-4 h-4 text-gym-primary flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-gym-muted uppercase tracking-wide">Horario</p>
                      <p className="text-sm text-gym-text whitespace-pre-line">{gymConfig.schedule}</p>
                    </div>
                  </div>
                )}
                {gymConfig.phone_number && (
                  <div className="flex items-center gap-3 p-2.5 bg-gym-bg/60 rounded-xl">
                    <Phone className="w-4 h-4 text-gym-primary flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-gym-muted uppercase tracking-wide">Teléfono</p>
                      <p className="text-sm text-gym-text">{gymConfig.phone_number}</p>
                    </div>
                  </div>
                )}
                {gymConfig.contact_email && (
                  <div className="flex items-center gap-3 p-2.5 bg-gym-bg/60 rounded-xl">
                    <Mail className="w-4 h-4 text-gym-primary flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-gym-muted uppercase tracking-wide">Correo</p>
                      <p className="text-sm text-gym-text">{gymConfig.contact_email}</p>
                    </div>
                  </div>
                )}
                {gymConfig.address && (
                  <div className="flex items-center gap-3 p-2.5 bg-gym-bg/60 rounded-xl">
                    <MapPin className="w-4 h-4 text-gym-primary flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-gym-muted uppercase tracking-wide">Dirección</p>
                      <p className="text-sm text-gym-text">{gymConfig.address}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tarifas */}
          {metodosPago.filter(m => m.is_active).length > 0 && (
            <Card className="neon-card overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-gym-secondary/5 to-transparent pointer-events-none" />
              <CardHeader className="pb-2 relative">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <div className="w-7 h-7 rounded-lg bg-gym-secondary/15 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-gym-secondary" />
                  </div>
                  Tarifas
                </CardTitle>
              </CardHeader>
              <CardContent className="relative">
                <div className="space-y-2">
                  {metodosPago.filter(m => m.is_active).map(m => (
                    <div key={m.payment_method} className="flex items-center justify-between p-2.5 bg-gym-bg/60 rounded-xl">
                      <span className="text-sm font-medium text-gym-text">
                        {m.payment_method === "efectivo" ? "Efectivo" : m.payment_method === "bs" ? "Bs" : "Binance"}
                      </span>
                      <div className="flex gap-4 text-sm">
                        <span className="text-gym-muted">{m.amount_monthly > 0 ? formatCurrency(m.amount_monthly) : "Gratis"}<span className="text-[10px] text-gym-muted ml-1">/mes</span></span>
                        {m.amount_inscription > 0 && (
                          <span className="text-gym-success font-medium">{formatCurrency(m.amount_inscription)}<span className="text-[10px] ml-1">insc.</span></span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Estado de cuenta */}
          <Card className="neon-card overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-gym-success/5 to-transparent pointer-events-none" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="flex items-center gap-2 text-sm">
                <div className="w-7 h-7 rounded-lg bg-gym-success/15 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-gym-success" />
                </div>
                Mi Estado
              </CardTitle>
            </CardHeader>
            <CardContent className="relative space-y-2">
              <div className="flex items-center justify-between p-2.5 bg-gym-bg/60 rounded-xl">
                <span className="text-sm text-gym-muted">Inscripción</span>
                {profile?.inscription_paid ? (
                  <Badge variant="success">Pagada</Badge>
                ) : (
                  <Badge variant="warning">Pendiente</Badge>
                )}
              </div>
              {profile?.start_date && (
                <div className="flex items-center justify-between p-2.5 bg-gym-bg/60 rounded-xl">
                  <span className="text-sm text-gym-muted">Fecha de inicio</span>
                  <span className="text-sm text-gym-text">{new Date(profile.start_date).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
              )}
              {montoPendiente > 0 && (
                <div className="flex items-center justify-between p-2.5 bg-gym-bg/60 rounded-xl border border-gym-warning/20">
                  <span className="text-sm text-gym-warning font-medium">Deuda</span>
                  <span className="text-sm font-semibold text-gym-warning">{formatCurrency(montoPendiente)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pendientes */}
          {pendientesHome.length > 0 && (
            <Card className="neon-card overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-gym-warning/5 to-transparent pointer-events-none" />
              <button
                type="button"
                onClick={() => setExpandedPendientes(!expandedPendientes)}
                className="w-full text-left"
              >
                <CardHeader className="pb-2 relative">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gym-warning/15 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-gym-warning" />
                      </div>
                      <span>Detalle Pendientes</span>
                      <Badge variant="warning" className="text-[10px]">{pendientesHome.length}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gym-warning">{formatCurrency(totalPendientesHome)}</span>
                      {expandedPendientes ? <ChevronDown className="w-4 h-4 text-gym-muted" /> : <ChevronRight className="w-4 h-4 text-gym-muted" />}
                    </div>
                  </CardTitle>
                </CardHeader>
              </button>
              {expandedPendientes && (
                <CardContent className="relative">
                  <div className="space-y-2">
                    {pendientesHome.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedPago(p as Payment); setModalOpen(true); }}
                        className="w-full text-left p-2.5 bg-gym-bg/60 rounded-xl hover:bg-gym-bg transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-white">{getPagoLabel(p)}</span>
                          <Badge variant={p.status === "pendiente" ? "warning" : "secondary"} className="text-[10px]">
                            {p.status === "pendiente" ? "Pendiente" : "Suspendido"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-gym-muted mt-1">
                          <span>{getTotalMonto(p) > 0 ? formatCurrency(getTotalMonto(p)) : "0.00"}</span>
                          <span>·</span>
                          <span className="text-gym-primary/80">{getPagoMesesInfo(p)}</span>
                          {p.bill_code && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-gym-secondary">{p.bill_code}</span>
                            </>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Morosidad */}
          {morosidad && (
            <Card className="neon-card overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-gym-danger/5 to-transparent pointer-events-none" />
              <button
                type="button"
                onClick={() => setExpandedMoroso(!expandedMoroso)}
                className="w-full text-left"
              >
                <CardHeader className="pb-2 relative">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gym-danger/15 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-gym-danger" />
                      </div>
                      <span>Morosidad</span>
                      <Badge variant="danger" className="text-[10px]">{morosidad.mesesDeuda.length} mes(es)</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gym-danger">{formatCurrency(morosidad.totalDeuda)}</span>
                      {expandedMoroso ? <ChevronDown className="w-4 h-4 text-gym-muted" /> : <ChevronRight className="w-4 h-4 text-gym-muted" />}
                    </div>
                  </CardTitle>
                </CardHeader>
              </button>
              {expandedMoroso && (
                <CardContent className="relative">
                  <div className="space-y-2">
                    {morosidad.mesesDeuda.map(mes => (
                      <div key={mes} className="flex items-center justify-between p-2.5 bg-gym-bg/60 rounded-xl">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-gym-danger" />
                          <span className="text-sm text-gym-text">{getMonthName(mes)} {morosidad.anioActual}</span>
                        </div>
                        <span className="text-sm font-medium text-gym-text">{formatCurrency(morosidad.montoMensual)}</span>
                      </div>
                    ))}
                    {morosidad.debeInscripcion && (
                      <div className="flex items-center justify-between p-2.5 bg-gym-bg/60 rounded-xl border border-gym-danger/20">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-gym-danger" />
                          <span className="text-sm text-gym-danger font-medium">Inscripción</span>
                        </div>
                        <span className="text-sm font-medium text-gym-danger">{formatCurrency(morosidad.montoInscripcion)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Distribución por hora */}
          {miembros.length > 0 && (() => {
            const hourCounts: Record<string, number> = {};
            for (const m of miembros) {
              if (m.arrival_time && m.departure_time && m.arrival_time !== "--:--" && m.departure_time !== "--:--") {
                const startH = parseInt(m.arrival_time.split(":")[0], 10);
                const endH = parseInt(m.departure_time.split(":")[0], 10);
                if (!isNaN(startH) && !isNaN(endH)) {
                  for (let h = startH; h <= endH; h++) {
                    const key = `${String(h).padStart(2, "0")}:00`;
                    // eslint-disable-next-line security/detect-object-injection
                    hourCounts[key] = (hourCounts[key] || 0) + 1;
                  }
                }
              }
            }
            const hourEntries = Object.entries(hourCounts).sort((a, b) => a[0].localeCompare(b[0]));
            const maxHourCount = Math.max(...hourEntries.map((e) => e[1]), 1);
            if (hourEntries.length === 0) return null;
            return (
              <Card className="neon-card overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 to-transparent pointer-events-none" />
                <CardHeader className="pb-2 relative">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <div className="w-7 h-7 rounded-lg bg-gym-primary/15 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-gym-primary" />
                    </div>
                    Horarios Pico
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative">
                  <div className="space-y-1.5">
                    {hourEntries.map(([hour, count]) => {
                      const pct = (count / maxHourCount) * 100;
                      const isTop = pct >= 80;
                      return (
                        <div key={hour} className="flex items-center gap-3">
                          <span className={`text-[11px] w-10 text-right font-mono ${isTop ? "text-gym-primary font-semibold" : "text-gym-muted"}`}>{hour}</span>
                          <div className="flex-1 h-4 bg-gym-bg/80 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${isTop ? "bg-gradient-to-r from-gym-primary/80 to-gym-primary shadow-[0_0_8px_rgba(56,189,248,0.3)]" : "bg-gradient-to-r from-gym-primary/40 to-gym-primary/60"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-[11px] w-5 text-right ${isTop ? "text-gym-primary font-semibold" : "text-gym-muted"}`}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gym-muted mt-3 text-center uppercase tracking-wide">Horarios más concurridos</p>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      {/* Payment form + pagos - super admin always, miembro only on pagos tab */}
      {(isSuperAdmin || activeTab === "pagos") && (
        <>
      {/* Payment form */}
      {showForm && (
        <Card className="neon-card relative z-10">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="w-5 h-5 text-gym-primary" />
              {miembroSeleccionado ? `Pago para ${miembroSeleccionado.full_name}` : "Guardar pago"}
              {!miembroSeleccionado && isAdmin && <Badge variant="success" className="text-[10px] ml-1">Auto-aprobado</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {membresiaLibre ? (
              <div className="text-center py-6">
                <Gift className="w-12 h-12 text-gym-secondary mx-auto mb-3" />
                <p className="font-medium text-gym-text">Membresía Libre</p>
                <p className="text-sm text-gym-muted">No tienes cargo mensual</p>
              </div>
            ) : (
              <form id="pago-form" onSubmit={handleSubmitPago} className="space-y-4">
                {/* Concepto de pago */}
                <div>
                  <label className="text-sm font-medium text-gym-muted mb-2 block">Concepto de pago</label>
                  <div className="space-y-2">
                    {showInscriptionCheckbox && (
                      <label className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl cursor-pointer hover:bg-gym-surface transition-colors">
                        <input
                          type="checkbox"
                          checked={formData.pagar_inscripcion}
                          onChange={(e) => setFormData({ ...formData, pagar_inscripcion: e.target.checked, solicitar_suspension: false })}
                          className="w-5 h-5 rounded border-gym-border text-gym-primary focus:ring-gym-primary"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gym-text">Inscripción</p>
                          <p className="text-xs text-gym-muted">{formatCurrency(getMontoByMetodo(formData.metodo_pago, "inscripcion"))}</p>
                        </div>
                        <Badge variant="warning">Pendiente</Badge>
                      </label>
                    )}
                    <label className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl cursor-pointer hover:bg-gym-surface transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.pagar_mensualidad}
                        onChange={(e) => setFormData({ ...formData, pagar_mensualidad: e.target.checked, solicitar_suspension: false })}
                        className="w-5 h-5 rounded border-gym-border text-gym-primary focus:ring-gym-primary"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gym-text">Mensualidad</p>
                        <p className="text-xs text-gym-muted">{formatCurrency(getMontoByMetodo(formData.metodo_pago, "mensual"))} × {formData.meses.length} mes(es)</p>
                      </div>
                      <Badge variant="primary">{formData.meses.length} meses</Badge>
                    </label>
                    {mesesParaSuspender.length > 0 && (
                      <label className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl cursor-pointer hover:bg-gym-surface transition-colors">
                        <input
                          type="checkbox"
                          checked={formData.solicitar_suspension}
                          onChange={(e) => setFormData({ ...formData, solicitar_suspension: e.target.checked, pagar_inscripcion: false, pagar_mensualidad: false })}
                          className="w-5 h-5 rounded border-gym-border text-gym-primary focus:ring-gym-primary"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gym-text">{messages.misPagos.solicitarSuspension}</p>
                          <p className="text-xs text-gym-muted">{messages.misPagos.suspensionDescripcion}</p>
                        </div>
                        <Badge variant="warning">?</Badge>
                      </label>
                    )}
                  </div>
                  {submitted && !formData.pagar_inscripcion && !formData.pagar_mensualidad && !formData.solicitar_suspension && (
                    <div ref={msgConceptoRef} className="flex items-center gap-2 mt-3 p-3 bg-gym-warning/10 border border-gym-warning/30 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-gym-warning flex-shrink-0" />
                      <p className="text-sm text-gym-warning">Debe seleccionar un concepto de pago</p>
                    </div>
                  )}
                </div>

                {/* Months selector */}
                {(formData.pagar_mensualidad || formData.solicitar_suspension) && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-gym-muted">Meses a pagar</label>
                      {!loadingPendientes && (formData.solicitar_suspension ? mesesParaSuspender : mesesDisponiblesParaPagar).length > 0 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          const lista = formData.solicitar_suspension ? mesesParaSuspender : mesesDisponiblesParaPagar;
                          setFormData(prev => ({ ...prev, meses: [...lista], pagar_mensualidad: !formData.solicitar_suspension }));
                        }}>Seleccionar todos</Button>
                      )}
                    </div>
                    {loadingPendientes ? (
                      <div className="flex items-center justify-center py-8 bg-gym-bg rounded-xl">
                        <div className="animate-spin w-6 h-6 border-2 border-gym-primary border-t-transparent rounded-full" />
                        <span className="ml-2 text-sm text-gym-muted">Cargando meses pendientes...</span>
                      </div>
                    ) : (formData.solicitar_suspension ? mesesParaSuspender : mesesDisponiblesParaPagar).length === 0 ? (
                      <div className="text-center py-8 bg-gym-bg rounded-xl">
                        <CheckCircle className="w-12 h-12 text-gym-success mx-auto mb-2 animate-pulse-glow" />
                        <p className="text-gym-muted font-medium">Sin deuda mensual</p>
                        <p className="text-xs text-gym-muted mt-1">Todos los meses están al día</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {(formData.solicitar_suspension ? mesesParaSuspender : mesesDisponiblesParaPagar).map(({ month_number, year_number }) => {
                          const seleccionado = formData.meses.some(m => m.month_number === month_number && m.year_number === year_number);
                          return (
                            <button
                              key={`${year_number}-${month_number}`}
                              type="button"
                              onClick={() => toggleMonth(month_number, year_number)}
                              className={`p-2 rounded-xl text-sm font-medium transition-all ${
                                seleccionado
                                  ? "bg-gym-primary text-gym-bg glow-primary"
                                  : "bg-gym-bg text-gym-muted border border-gym-border hover:border-gym-primary hover:shadow-[0_0_10px_rgba(56,189,248,0.2)]"
                              }`}
                            >
                              <div className="text-center">
                                <div className="font-semibold">{getMonthName(month_number).slice(0, 3)}</div>
                                <div className="text-xs opacity-75">{year_number}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-xs text-gym-muted mt-2">{formData.meses.length} mes(es) seleccionados</p>
                    {submitted && formData.meses.length === 0 && (formData.solicitar_suspension ? mesesParaSuspender : mesesDisponiblesParaPagar).length > 0 && (
                      <div ref={msgMesesRef} className="flex items-center gap-2 mt-3 p-3 bg-gym-warning/10 border border-gym-warning/30 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-gym-warning flex-shrink-0" />
                        <p className="text-sm text-gym-warning">Debe seleccionar mes(es) a pagar</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Payment method */}
                {!formData.solicitar_suspension && (
                  <div>
                    <label className="block text-sm font-medium text-gym-muted mb-2">Método de pago</label>
                    <div className="flex gap-2">
                      {metodosPago.filter(m => m.is_active || m.payment_method === "efectivo").map(m => (
                        <button
                          key={m.payment_method}
                          type="button"
                          onClick={() => setFormData({ ...formData, metodo_pago: m.payment_method })}
                          className={`flex-1 p-2 rounded-xl text-sm font-medium transition-all ${
                            formData.metodo_pago === m.payment_method
                              ? "bg-gym-primary text-white"
                              : "bg-gym-bg text-gym-muted border border-gym-border hover:border-gym-primary"
                          }`}
                        >
                          {m.payment_method === "efectivo" ? "💵 Efectivo" : m.payment_method === "bs" ? "🇻🇪 Bs" : "🟡 Binance"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bill code for cash */}
                {!formData.solicitar_suspension && formData.metodo_pago === "efectivo" && (
                  <div>
                    <label className="block text-sm font-medium text-gym-muted mb-2">
                      <FileText className="w-4 h-4 inline mr-1" /> Código(s) del billete
                    </label>
                    <input
                      placeholder="Ej: A1B2C, D3E4F"
                      value={formData.codigo_billete}
                      onChange={(e) => setFormData({ ...formData, codigo_billete: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary"
                    />
                  </div>
                )}

                {/* Comprobante for non-cash */}
                {!formData.solicitar_suspension && needsComprobante(formData.metodo_pago) && (
                  <div>
                    <label className="block text-sm font-medium text-gym-muted mb-2">Comprobante de pago</label>
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gym-border rounded-xl cursor-pointer hover:border-gym-primary transition-colors">
                      <Upload className="w-6 h-6 text-gym-muted mb-1" />
                      <span className="text-xs text-gym-muted">{comprobante ? comprobante.name : "Adjuntar imagen o PDF"}</span>
                      <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setComprobante(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gym-muted mb-2">Notas (opcional)</label>
                  <textarea
                    placeholder="Algún comentario..."
                    value={formData.notas}
                    onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary resize-none h-16"
                  />
                </div>

                {/* Date */}
                {!formData.solicitar_suspension && (
                  <div>
                    <label className="block text-sm font-medium text-gym-muted mb-2">
                      <Calendar className="w-4 h-4 inline mr-1" /> Fecha de pago
                    </label>
                    <input
                      type="date"
                      value={formData.fecha_pago}
                      onChange={(e) => setFormData({ ...formData, fecha_pago: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary"
                    />
                  </div>
                )}

                {/* Total */}
                {!formData.solicitar_suspension && (
                  <div className="p-4 bg-gym-bg rounded-xl neon-border">
                    <div className="flex items-center justify-between">
                      <span className="text-gym-muted">Total a pagar:</span>
                      <span className="text-2xl font-bold text-gym-text neon-text">{formatCurrency(montoTotal)}</span>
                    </div>
                  </div>
                )}

                {formData.solicitar_suspension && (
                  <div className="p-4 bg-gym-warning/10 border border-gym-warning/30 rounded-xl">
                    <p className="text-sm text-gym-warning">{messages.misPagos.seleccionarMesesSuspender}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => {
                    setFormData({ meses: [], metodo_pago: "efectivo", codigo_billete: "", notas: "", pagar_inscripcion: false, pagar_mensualidad: false, solicitar_suspension: false, fecha_pago: new Date().toISOString().split("T")[0] });
                    setComprobante(null);
                    setSubmitted(false);
                  }}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    loading={savingPago}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {formData.solicitar_suspension ? messages.misPagos.enviarSolicitud : "Guardar"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {!showForm && !isSuperAdmin && (
        <div className="hidden sm:flex justify-end">
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo pago
          </Button>
        </div>
      )}

      {/* Payment list */}
      <Card className="neon-card">
        <button
          type="button"
          onClick={() => setShowPagosRealizados(!showPagosRealizados)}
          className="w-full"
        >
          <CardHeader className="pb-2 cursor-pointer">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-gym-primary" />
                Pagos Realizados
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-normal text-gym-muted">{pagos.length} pago(s)</span>
                {showPagosRealizados ? (
                  <ChevronDown className="w-4 h-4 text-gym-muted" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gym-muted" />
                )}
              </div>
            </CardTitle>
          </CardHeader>
        </button>
        {showPagosRealizados && (
        <CardContent>
          {pagos.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 text-gym-muted mx-auto mb-3" />
              <p className="text-gym-muted">No hay pagos registrados</p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
              {pagosOrdenados.map(pago => (
                <div key={pago.id} className="p-3 bg-gym-bg rounded-xl hover:bg-gym-surface transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-white truncate">
                          {getPagoLabel(pago)}
                        </span>
                        <Badge
                          variant={pago.status === "aprobado" ? "success" : pago.status === "rechazado" ? "danger" : pago.status === "suspendido" ? "secondary" : "warning"}
                          className="text-[10px] px-1.5 py-0 flex-shrink-0"
                        >
                          {pago.status === "aprobado" ? "Aprobado" : pago.status === "rechazado" ? "Rechazado" : pago.status === "suspendido" ? "Suspendido" : "Pendiente"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gym-muted mt-1">
                        <span className="font-medium">
                          {(pago.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0) > 0
                            ? formatCurrency(pago.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0)
                            : "0.00"}
                        </span>
                        <span>·</span>
                        <span className="text-gym-primary/80">{getPagoMesesInfo(pago)}</span>
                        {pago.bill_code && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-gym-secondary">{pago.bill_code}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedPago(pago as Payment); setModalOpen(true); }}
                      className="p-2 text-gym-primary hover:bg-gym-primary/10 rounded-lg transition-colors flex-shrink-0"
                      title="Ver detalle"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {(pago.status === "pendiente" || pago.status === "suspendido_pendiente") && (
                      <button
                        onClick={() => handleDelete(pago.id)}
                        disabled={deleting === pago.id}
                        className="p-1.5 text-gym-danger hover:bg-gym-danger/10 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {deleting === pago.id ? (
                          <div className="w-4 h-4 border-2 border-gym-danger border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Totals */}
      {pagos.length > 0 && (
        <Card className="neon-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gym-muted flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-gym-success" /> Aprobado
              </span>
              <span className="text-sm font-semibold text-gym-success">{formatCurrency(montoAprobado)}</span>
            </div>
            {montoPendiente > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gym-muted flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gym-warning" /> Pendiente
                </span>
                <span className="text-sm font-semibold text-gym-warning">{formatCurrency(montoPendiente)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-gym-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gym-text">Total</span>
                <span className="text-lg font-bold text-gym-text neon-text">{formatCurrency(montoAprobado + montoPendiente)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Detalle del Pago">
        {selectedPago && (
          <div className="space-y-4">
            {isSuperAdmin && miembroSeleccionado && (
              <div>
                <p className="text-sm text-gym-muted">Miembro</p>
                <div className="flex items-center gap-2 mt-1">
                  <Avatar src={miembroSeleccionado.avatar_url} alt={miembroSeleccionado.full_name || ""} size="sm" />
                  <div>
                    <p className="text-gym-text font-medium">{miembroSeleccionado.full_name}</p>
                    <p className="text-xs text-gym-muted">{miembroSeleccionado.email}</p>
                  </div>
                </div>
              </div>
            )}
            <div>
              <p className="text-sm text-gym-muted">Concepto</p>
              <p className="text-gym-text font-medium">
                {selectedPago.detail?.[0]?.month_number
                  ? getPagoMesesInfo(selectedPago)
                  : isInscripcion(selectedPago)
                  ? "Inscripción"
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gym-muted">Tipo</p>
              <p className="text-gym-text">{getTipoLabel(selectedPago)}</p>
            </div>
            <div>
              <p className="text-sm text-gym-muted">Monto</p>
              <p className="text-2xl font-bold text-gym-text neon-text">{formatCurrency(getTotalMonto(selectedPago))}</p>
            </div>
            <div>
              <p className="text-sm text-gym-muted">Método de pago</p>
              <p className="text-gym-text">{metodoLabels[selectedPago.payment_method] || selectedPago.payment_method}</p>
            </div>
            <div>
              <p className="text-sm text-gym-muted">Estado</p>
              <Badge
                variant={
                  selectedPago.status === "aprobado"
                    ? "success"
                    : selectedPago.status === "rechazado"
                    ? "danger"
                    : selectedPago.status === "suspendido"
                    ? "secondary"
                    : "warning"
                }
              >
                {selectedPago.status === "aprobado"
                  ? "Aprobado"
                  : selectedPago.status === "rechazado"
                  ? "Rechazado"
                  : selectedPago.status === "suspendido"
                  ? "Suspendido"
                  : "Pendiente"}
              </Badge>
            </div>
            {selectedPago.bill_code && (
              <div>
                <p className="text-sm text-gym-muted">Código del billete</p>
                <p className="text-gym-text font-mono">{selectedPago.bill_code}</p>
              </div>
            )}
            {selectedPago.receipt_url && (
              <div>
                <p className="text-sm text-gym-muted mb-2">Comprobante</p>
                <a href={selectedPago.receipt_url} target="_blank" rel="noopener noreferrer" className="text-gym-primary hover:underline">
                  Ver comprobante
                </a>
              </div>
            )}
            <div>
              <p className="text-sm text-gym-muted">Notas</p>
              <p className="text-gym-text">{selectedPago.payment_note || "—"}</p>
            </div>
            {selectedPago.status === "aprobado" && selectedPago.approved_by_profile && (
              <div>
                <p className="text-sm text-gym-muted">Aprobado por</p>
                <p className="text-gym-text">
                  {selectedPago.approved_by_profile.full_name}
                  {selectedPago.approved_at ? ` · ${new Date(selectedPago.approved_at).toLocaleDateString("es-ES")}` : ""}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
        </>
      )}
    </div>

      {/* Mobile floating buttons for payment form */}
      {showForm ? (
          <button
            type="submit"
            form="pago-form"
            className="sm:hidden fixed bottom-24 right-4 z-[60] w-14 h-14 rounded-full bg-gym-success/80 text-white shadow-lg shadow-gym-success/20 flex items-center justify-center active:scale-95 transition-all"
          >
            {savingPago ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-6 h-6" />
            )}
          </button>
      ) : !isSuperAdmin && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="sm:hidden fixed bottom-24 right-4 z-[60] w-14 h-14 rounded-full bg-gym-primary/80 text-white shadow-lg shadow-gym-primary/20 flex items-center justify-center active:scale-95 transition-all"
          >
            <Plus className="w-6 h-6" />
          </button>
      )}
    </>
  );
}

export default function MisPagosPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gym-primary" /></div>}>
      <MisPagosContent />
    </Suspense>
  );
}
