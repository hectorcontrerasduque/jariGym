"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { configService } from "@/lib/services/config/config.service";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { CreditCard, CheckCircle, Clock, Calendar, Eye, Trash2, FileText, Plus, Search, Upload, Gift, AlertTriangle, ChevronDown, ChevronRight, X, Save } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { Avatar } from "@/components/ui/avatar";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import type { Payment, Profile, MetodoPago, PaymentMethod, GymConfig } from "@/lib/types";

const metodoLabels: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  bs: "Bs",
  binance: "Binance",
};

function getPagoLabel(pago: Payment): string {
  const det = pago.detail?.[0];
  if (det?.payment_type === "inscripcion") return "Inscripción";
  if (det?.month_number && det?.year_number) return `${getMonthName(det.month_number)} ${det.year_number}`;
  return "Pago";
}

function getPagoIcon(pago: Payment) {
  const det = pago.detail?.[0];
  if (det?.payment_type === "inscripcion") return <FileText className="w-5 h-5 text-gym-primary" />;
  return <Calendar className="w-5 h-5 text-gym-secondary" />;
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

export default function MisPagosPage() {
  const router = useRouter();
  const [pagos, setPagos] = useState<Payment[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [gymConfig, setGymConfig] = useState<GymConfig | null>(null);

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "super_admin";

  // Super admin: member selector
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [miembroSearch, setMiembroSearch] = useState("");
  const [miembroSeleccionado, setMiembroSeleccionado] = useState<Profile | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  // Payment form
  const [selectedPago, setSelectedPago] = useState<Payment | null>(null);
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

    // 3. Cargar config
    try {
      const { data: cfg, error: cfgError } = await supabase
        .from("gym_config")
        .select("*")
        .limit(1)
        .single();
      if (cfgError) {
        // gym_config puede no existir aún - eso está bien
        config = null;
      } else {
        config = cfg;
      }
    } catch (err) {
      console.error("Error cargando config:", err);
      config = null;
    }

    setPagos(pagosData);
    setAnios(aniosData);
    setGymConfig(config);

    // 4. Cargar métodos de pago
    try {
      const metodos = await configService.getMetodosPago();
      setMetodosPago(metodos);
    } catch (err) {
      console.error("Error cargando métodos de pago:", err);
      showToast(messages.toast.errorCargaDatos, "error");
      setMetodosPago([]);
    }

    // 5. Cargar miembros (solo super_admin)
    if (isAdmin) {
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
    }
  }, [miembroSeleccionado, isAdmin]);

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
        createClient().from("membresias").select("id").eq("usuario_id", miembroId).is("fecha_fin", null).maybeSingle(),
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
        createClient().from("membresias").select("id").eq("usuario_id", userId).is("fecha_fin", null).maybeSingle(),
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
      setTimeout(() => msgConceptoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      return;
    }
    if ((formData.pagar_mensualidad || formData.solicitar_suspension) && formData.meses.length === 0) {
      setTimeout(() => msgMesesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      return;
    }
    if (!formData.solicitar_suspension && montoTotal === 0) return;

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
        await pagosService.crearPagoSuspendido(targetId, formData.meses, formData.notas || undefined);
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
      if (isSuperAdmin) {
        router.push("/dashboard/pagos");
      } else {
        setShowForm(true);
        setSubmitted(false);
        setFormData({ meses: [], metodo_pago: "efectivo", codigo_billete: "", notas: "", pagar_inscripcion: false, pagar_mensualidad: false, solicitar_suspension: false, fecha_pago: new Date().toISOString().split("T")[0] });
        setComprobante(null);
        await fetchMisPagosData();
        await reloadPendientes();
      }
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

  const aprobados = pagos.filter(p => p.status === "aprobado");
  const pendientes = pagos.filter(p => p.status === "pendiente");
  const montoAprobado = aprobados.reduce((sum, p) => sum + (p.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0), 0);
  const montoPendiente = pendientes.reduce((sum, p) => sum + (p.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0), 0);

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
          return p.status === "pendiente" || p.status === "aprobado";
        })
        .flatMap(p => (p.detail || []).map(d => d.month_number && d.year_number ? `${d.year_number}-${d.month_number}` : null))
        .filter(Boolean)
    );
    return mesesPendientes.filter(m => !mesesConPago.has(`${m.year_number}-${m.month_number}`));
  })();

  const mesesParaSuspender = [...mesesDisponiblesParaPagar].sort((a, b) => a.year_number - b.year_number || a.month_number - b.month_number);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <LoadingOverlay show={savingPago || !!deleting} message={savingPago ? messages.common.guardando : messages.common.eliminando} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Mis Pagos</h1>
          <p className="text-gym-muted text-sm">
            {miembroSeleccionado ? `Pagos de ${miembroSeleccionado.full_name || miembroSeleccionado.email}` : "Historial y registro de pagos"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={anioSeleccionado}
            onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
            className="px-4 py-2 bg-gym-surface border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary"
          >
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Super Admin: member selector */}
      {isSuperAdmin && (
        <Card className="neon-card relative z-10">
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

                <div className="hidden sm:flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>
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

      {/* Mobile floating buttons for payment form */}
      {showForm && (
        <>
          <button
            type="submit"
            form="pago-form"
            className="sm:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gym-success/80 text-white shadow-lg shadow-gym-success/20 flex items-center justify-center active:scale-95 transition-all"
          >
            {savingPago ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-6 h-6" />
            )}
          </button>
        </>
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
            <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
              {pagos.map(pago => (
                <div key={pago.id} className="p-2.5 bg-gym-bg rounded-xl hover:bg-gym-surface transition-colors">
                  <div className="flex items-center gap-2">
                    {getPagoIcon(pago)}
                    <div className="justify-end">
                      <Eye
                        className="w-4 h-4 text-gym-primary"
                        onClick={() => setSelectedPago(pago as Payment)}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gym-text truncate">{getPagoLabel(pago)}</span>
                        <Badge
                          variant={pago.status === "aprobado" ? "success" : pago.status === "rechazado" ? "danger" : "warning"}
                          className="text-[10px] px-1.5 py-0 flex-shrink-0"
                        >
                          {pago.status === "aprobado" ? "Aprobado" : pago.status === "rechazado" ? "Rechazado" : pago.status === "suspendido" ? "Suspendido" : "Pendiente"}
                        </Badge>
                        <span className="text-xs text-gym-primary">{getTipoLabel(pago)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gym-muted">
                        <span>{(pago.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0) > 0 ? formatCurrency(pago.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0) : "Gratis"}</span>
                        {showPagosRealizados && (
                          <span className="text-[10px] text-gym-primary/80 ms-2">
                            {getPagoMesesInfo(pago)}
                          </span>
                        )}
                        {pago.bill_code && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{pago.bill_code}</span>
                          </>
                        )}
                      </div>
                      {pago.status === "aprobado" && pago.approved_by_profile && (
                        <p className="text-[10px] text-gym-success/80 mt-0.5">
                          Aprobado por {pago.approved_by_profile.full_name}{pago.approved_at ? ` · ${new Date(pago.approved_at).toLocaleDateString("es-ES")}` : ""}
                        </p>
                      )}
                      {pago.payment_note && (
                        <p className="text-[10px] text-gym-muted/70 truncate mt-0.5">{pago.payment_note}</p>
                      )}
                    </div>
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
    </div>
  );
}
