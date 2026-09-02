"use client";

import { useEffect, useState } from "react";
import {
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  UserCheck,
  Gift,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { miembrosService } from "@/lib/services/miembros/miembros.service";
import { formatCurrency, getMonthName } from "@/lib/utils";
import type { Payment, Profile } from "@/lib/types";
import { showToast } from "@/components/ui/toast";
import { Loader } from "@/components/ui/loader";
import { messages } from "@/lib/messages";

interface MonthlyStat {
  month_number: number;
  year_number: number;
  nombre: string;
  pagados: number;
  pendientes: number;
  sinPago: number;
  libres: number;
  montoAcumulado: number;
  montoAdeudado: number;
}

const particleCount = 12;

function generateParticles() {
  return Array.from({ length: particleCount }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 6,
    duration: 4 + Math.random() * 4,
    size: 2 + Math.random() * 3,
    colorIndex: Math.floor(Math.random() * 3),
  }));
}

const particles = generateParticles();

function FloatingParticles() {
  return (
    <div className="particles-container">
      {particles.map((p, i) => (
        <div
          key={i}
          className="particle"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.colorIndex === 0 ? "rgba(56, 189, 248, 0.3)" : p.colorIndex === 1 ? "rgba(129, 140, 248, 0.2)" : "rgba(52, 211, 153, 0.2)",
          }}
        />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<{
    totalMiembros: number;
    miembrosActivos: number;
    inscritosPagados: number;
    inscritosPendientes: number;
    deudoresTotal: number;
    deudoresInscripcion: number;
    deudoresMensualidad: number;
    alDiaMensualidad: number;
    montoDeuda: number;
    montoDeudaInscripcion: number;
    montoDeudaMensualidad: number;
    montoPagado: number;
    membresiaLibre: number;
    pagosConfirmados: number;
    pagosPendientes: number;
    ingresosMes: number;
  } | null>(null);
  const [pagosRecientes, setPagosRecientes] = useState<Payment[]>([]);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [monthlyStats, setMonthlyStats] = useState<{ totalMiembros: number; libres: number; meses: MonthlyStat[] } | null>(null);
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [collapsePagosMes, setCollapsePagosMes] = useState(true);
  const [collapsePagosRecientes, setCollapsePagosRecientes] = useState(true);
  const [collapseDistHoras, setCollapseDistHoras] = useState(true);
  const [particleReady] = useState(true);
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [modalData, setModalData] = useState<{ title: string; members: Array<{ id: string; nombre: string; detalle?: string }> } | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      const timer = setTimeout(() => setShowBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
          if (!cancelled && profile?.role === "super_admin") setIsSuperAdmin(true);
        }

        const [statsResult, pagosResult, aniosResult, monthlyResult, miembrosResult] = await Promise.allSettled([
          pagosService.stats(anioSeleccionado),
          pagosService.pagosRecientesAprobados(anioSeleccionado),
          pagosService.aniosConPagos(),
          pagosService.monthlyStats(anioSeleccionado),
          miembrosService.listarMiembros(),
        ]);
        if (!cancelled) {
          if (statsResult.status === "fulfilled") setStats(statsResult.value);
          if (pagosResult.status === "fulfilled") setPagosRecientes(pagosResult.value.slice(0, 5));
          if (aniosResult.status === "fulfilled") setAnios(aniosResult.value);
          if (monthlyResult.status === "fulfilled") setMonthlyStats(monthlyResult.value);
          if (miembrosResult.status === "fulfilled") setMiembros(miembrosResult.value);
        }
      } catch {
        if (!cancelled) showToast(messages.toast.errorCargaDatos, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [anioSeleccionado]);

  const getNombreMiembro = (pago: Payment): string => {
    if (pago.profile?.full_name) return pago.profile.full_name;
    const miembro = miembros.find((m) => m.id === pago.user_id);
    return miembro?.full_name || "Desconocido";
  };

  if (loading) {
    return <Loader show={true} message={messages.common.cargandoDashboard} />;
  }

  const maxMiembros = monthlyStats ? Math.max(...monthlyStats.meses.map(m => m.pagados + m.sinPago + m.libres), 1) : 1;

  const hourCounts = new Map<string, number>();
  for (const m of miembros) {
    if (m.arrival_time && m.departure_time && m.arrival_time !== "--:--" && m.departure_time !== "--:--") {
      const startH = parseInt(m.arrival_time.split(":")[0], 10);
      const endH = parseInt(m.departure_time.split(":")[0], 10);
      if (!isNaN(startH) && !isNaN(endH)) {
        for (let h = startH; h <= endH; h++) {
          const key = `${String(h).padStart(2, "0")}:00`;
          hourCounts.set(key, (hourCounts.get(key) || 0) + 1);
        }
      }
    }
  }
  const hourEntries = Array.from(hourCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxHourCount = Math.max(...hourEntries.map((e) => e[1]), 1);

  const handleClickMorosos = async () => {
    setLoadingModal(true);
    try {
      const morosos = await pagosService.getMiembrosMorosos(anioSeleccionado);
      setModalData({
        title: "Morosos",
        members: morosos.map((m) => ({
          id: m.id,
          nombre: m.full_name,
          detalle: `${m.mesesDeuda.length} mes(es) sin pago${m.debeInscripcion ? " + inscripción" : ""} — ${formatCurrency(m.totalDeuda)}`,
        })),
      });
    } catch {
      showToast(messages.toast.errorCargarMorosos, "error");
    } finally {
      setLoadingModal(false);
    }
  };

  const handleClickAlDia = async () => {
    setLoadingModal(true);
    try {
      const supabase = createClient();
      const mesActual = new Date().getMonth() + 1;
      const anioActual = new Date().getFullYear();
      const { data: pagosHeader } = await supabase
        .from("payments")
        .select("id, user_id")
        .eq("status", "aprobado");
      const pagoIds = (pagosHeader || []).map((p) => p.id);
      const { data: pagosDetalles } = await supabase
        .from("payment_detail")
        .select("payment_id")
        .in("payment_id", pagoIds.length > 0 ? pagoIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("month_number", mesActual)
        .eq("year_number", anioActual)
        .eq("payment_type", "mensualidad");
      const pagoUsuarioMap = new Map((pagosHeader || []).map((p) => [p.id, p.user_id]));
      const idsAlDia = Array.from(new Set(
        (pagosDetalles || []).map((d) => pagoUsuarioMap.get(d.payment_id)).filter(Boolean)
      ));
      const alDia = miembros.filter((m) => idsAlDia.includes(m.id));
      setModalData({
        title: "Al día",
        members: alDia.map((m) => ({ id: m.id, nombre: m.full_name })),
      });
    } catch {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoadingModal(false);
    }
  };

  const handleClickMembresiaLibre = async () => {
    setLoadingModal(true);
    try {
      const supabase = createClient();
      const { data: libres } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("status", "activa")
        .is("end_date", null);
      const libresIds = new Set((libres || []).map((l) => l.user_id));
      const libresList = miembros.filter((m) => libresIds.has(m.id));
      setModalData({
        title: "Membresía Libre",
        members: libresList.map((m) => ({ id: m.id, nombre: m.full_name })),
      });
    } catch {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoadingModal(false);
    }
  };

  const handleClickActivos = () => {
    setModalData({
      title: "Miembros Activos",
      members: miembros.map((m) => ({
        id: m.id,
        nombre: m.full_name,
        detalle: m.email || "",
      })),
    });
  };

  const trendPercent = stats && stats.miembrosActivos > 0
    ? Math.round(((stats.alDiaMensualidad || 0) / stats.miembrosActivos) * 100)
    : 0;

  return (
    <div className="relative min-h-screen bg-gym-bg">
      {particleReady && <FloatingParticles />}

      <div className="relative z-10 dashboard-container">
        {isSuperAdmin && showBanner && (
          <div className="admin-welcome-banner rounded-2xl p-4 sm:p-5 relative z-20 overflow-hidden mb-6 animate-slideUp">
            <div className="absolute top-2 right-4 w-2 h-2 bg-yellow-400 rounded-full animate-float" style={{ animationDelay: "0s" }} />
            <div className="absolute top-4 right-10 w-1.5 h-1.5 bg-amber-300 rounded-full animate-float" style={{ animationDelay: "0.5s" }} />
            <div className="absolute bottom-3 right-6 w-1 h-1 bg-yellow-500 rounded-full animate-float" style={{ animationDelay: "1s" }} />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg shadow-yellow-500/30">
                <span className="text-lg">👑</span>
              </div>
              <div>
                <p className="text-sm font-display font-bold">
                  <span className="neon-text-warning">Bienvenido, Administrador</span>
                </p>
                <p className="text-xs text-gym-muted">Acceso total al sistema</p>
              </div>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <div className="hero-section mb-4 sm:mb-6 animate-slideUp">
          <div className="relative z-10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="gym-logo-icon">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-gym-primary" />
              </div>
              <div>
                <h1 className="text-xl sm:text-3xl font-display font-bold text-gym-text neon-text leading-tight">
                  Dashboard
                </h1>
                <p className="text-gym-muted text-xs sm:text-sm flex items-center gap-1.5">
                  <BarChart3 className="w-3 h-3" />
                  <span className="hidden sm:inline">Resumen general del gym</span>
                  <span className="sm:hidden">Resumen</span>
                  <span className="text-gym-success font-semibold text-xs ml-1">{trendPercent}%</span>
                </p>
              </div>
            </div>
            <select
              value={anioSeleccionado}
              onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
              className="px-3 py-1.5 bg-gym-surface border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary text-xs sm:text-sm"
            >
              {anios.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats Grid - 4 cards */}
        <div className="stats-grid section-gap">
          <Card className="stat-card" onClick={handleClickActivos}>
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-start justify-between mb-2 sm:mb-4">
                <div className="stat-icon stat-icon-primary">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gym-primary" />
                </div>
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-gym-success/10 border border-gym-success/20">
                  <CheckCircle className="w-3 h-3 text-gym-success" />
                  <span className="text-[10px] font-medium text-gym-success">Activo</span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs text-gym-muted mb-0.5 sm:mb-1 uppercase tracking-wider">Miembros Activos</p>
                  <div className="stat-number text-gym-text">{stats?.miembrosActivos || 0}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[9px] sm:text-[10px] text-gym-muted">{stats?.inscritosPagados || 0} inscritos</span>
                  <span className="text-[9px] sm:text-[10px] text-gym-warning">{stats?.inscritosPendientes || 0} pendientes</span>
                </div>
              </div>
              <div className="mt-2 sm:mt-4 progress-bar">
                <div
                  className="progress-bar-fill bg-gradient-to-r from-gym-success to-gym-success/60"
                  style={{ width: `${stats?.miembrosActivos ? (stats.inscritosPagados / stats.miembrosActivos) * 100 : 0}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card" onClick={handleClickMorosos}>
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-start justify-between mb-2 sm:mb-4">
                <div className="stat-icon stat-icon-danger">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-gym-danger" />
                </div>
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-gym-danger/10 border border-gym-danger/20">
                  <Clock className="w-3 h-3 text-gym-danger" />
                  <span className="text-[10px] font-medium text-gym-danger">Deuda</span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs text-gym-muted mb-0.5 sm:mb-1 uppercase tracking-wider">Morosos</p>
                  <div className="stat-number text-gym-danger">{stats?.deudoresTotal || 0}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[9px] sm:text-[10px] text-gym-danger">{stats?.deudoresMensualidad || 0} mens.</span>
                  <span className="text-[9px] sm:text-[10px] text-gym-warning">{stats?.deudoresInscripcion || 0} inscr.</span>
                </div>
              </div>
              <div className="mt-2 sm:mt-4 flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-gym-danger">{formatCurrency(stats?.montoDeuda || 0)}</span>
                <span className="text-[9px] sm:text-[10px] text-gym-muted">deuda</span>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card" onClick={handleClickAlDia}>
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-start justify-between mb-2 sm:mb-4">
                <div className="stat-icon stat-icon-success">
                  <UserCheck className="w-4 h-4 sm:w-5 sm:h-5 text-gym-success" />
                </div>
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-gym-success/10 border border-gym-success/20">
                  <Zap className="w-3 h-3 text-gym-success" />
                  <span className="text-[10px] font-medium text-gym-success">Al día</span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs text-gym-muted mb-0.5 sm:mb-1 uppercase tracking-wider">Al Día</p>
                  <div className="stat-number text-gym-success">
                    <span className="text-gym-text">{stats?.alDiaMensualidad || 0}</span>
                    <span className="text-xs sm:text-lg text-gym-muted mx-0.5 sm:mx-1">/</span>
                    <span className="text-gym-text">{stats?.miembrosActivos || 0}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm sm:text-lg font-bold text-gym-text">{formatCurrency(stats?.montoPagado || 0)}</p>
                  <p className="text-[9px] sm:text-[10px] text-gym-muted">cobrado</p>
                </div>
              </div>
              <div className="mt-2 sm:mt-4 progress-bar">
                <div
                  className="progress-bar-fill bg-gradient-to-r from-gym-success to-gym-success/60"
                  style={{ width: `${trendPercent}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card" onClick={handleClickMembresiaLibre}>
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-start justify-between mb-2 sm:mb-4">
                <div className="stat-icon stat-icon-secondary">
                  <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-gym-secondary" />
                </div>
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-gym-secondary/10 border border-gym-secondary/20">
                  <span className="text-[10px] font-medium text-gym-secondary">Libre</span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] sm:text-xs text-gym-muted mb-0.5 sm:mb-1 uppercase tracking-wider">Membresía Libre</p>
                  <div className="stat-number text-gym-secondary">{stats?.membresiaLibre || 0}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[9px] sm:text-[10px] text-gym-secondary">{stats?.totalMiembros || 0} total</span>
                  <span className="text-[9px] sm:text-[10px] text-gym-muted">miembros</span>
                </div>
              </div>
              <div className="mt-2 sm:mt-4 flex items-center gap-2">
                <div className="flex-1 h-1.5 sm:h-2 bg-gym-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-gym-secondary to-gym-secondary/60 rounded-full transition-all"
                    style={{ width: `${stats?.totalMiembros ? (stats.membresiaLibre / stats.totalMiembros) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[9px] sm:text-[10px] text-gym-muted">{stats?.totalMiembros ? Math.round((stats.membresiaLibre / stats.totalMiembros) * 100) : 0}%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bar Chart */}
        {monthlyStats && (
          <Card className="chart-section mb-4 animate-slideUp" style={{ animationDelay: "0.1s" }}>
            <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setCollapsePagosMes(!collapsePagosMes)}>
              <CardTitle className="flex items-center gap-2">
                {collapsePagosMes ? <ChevronRight className="w-5 h-5 text-gym-primary" /> : <ChevronDown className="w-5 h-5 text-gym-primary" />}
                <BarChart3 className="w-4 h-4 text-gym-primary" />
                Pagos por Mes - {anioSeleccionado}
              </CardTitle>
            </CardHeader>
            {!collapsePagosMes && (
              <CardContent>
                <div className="space-y-4">
                  {(showAllMonths ? [...monthlyStats.meses].reverse() : [...monthlyStats.meses].reverse().slice(0, 3)).map((m) => {
                    const total = m.pagados + m.sinPago + m.libres;
                    const pagadosWidth = total > 0 ? (m.pagados / maxMiembros) * 100 : 0;
                    const sinPagoWidth = total > 0 ? (m.sinPago / maxMiembros) * 100 : 0;
                    const libresWidth = total > 0 ? (m.libres / maxMiembros) * 100 : 0;

                    return (
                      <div key={`${m.year_number}-${m.month_number}`} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gym-text">{m.nombre} {m.year_number}</span>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-sm bg-gym-success" />
                              {m.pagados} pagados
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-sm bg-gym-danger" />
                              {m.sinPago} sin pago
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-sm bg-gym-secondary" />
                              {m.libres} libres
                            </span>
                          </div>
                        </div>
                        <div className="progress-bar">
                          {pagadosWidth > 0 && (
                            <div className="progress-bar-fill bg-gradient-to-r from-gym-success to-gym-success/70" style={{ width: `${pagadosWidth}%` }} />
                          )}
                          {sinPagoWidth > 0 && (
                            <div className="progress-bar-fill bg-gradient-to-r from-gym-danger to-gym-danger/70" style={{ width: `${sinPagoWidth}%` }} />
                          )}
                          {libresWidth > 0 && (
                            <div className="progress-bar-fill bg-gradient-to-r from-gym-secondary to-gym-secondary/70" style={{ width: `${libresWidth}%` }} />
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gym-success font-medium">{formatCurrency(m.montoAcumulado)} cobrado</span>
                          {m.sinPago > 0 && (
                            <span className="text-gym-danger">{formatCurrency(m.montoAdeudado)} adeudado</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-6 mt-4 text-xs text-gym-muted">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gym-success" /> Pagado</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gym-danger" /> Sin pago</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gym-secondary" /> Libre</span>
                </div>
                {monthlyStats.meses.length > 3 && (
                  <div className="text-center mt-3">
                    <button
                      onClick={() => setShowAllMonths(!showAllMonths)}
                      className="text-sm text-gym-primary hover:text-gym-primary/80 transition-colors font-medium"
                    >
                      {showAllMonths ? "Ver menos" : `Ver todos los meses (${monthlyStats.meses.length})`}
                    </button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* Pagos recientes + Distribución hora */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card className="chart-section animate-slideUp" style={{ animationDelay: "0.2s" }}>
            <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setCollapsePagosRecientes(!collapsePagosRecientes)}>
              <CardTitle className="flex items-center gap-2">
                {collapsePagosRecientes ? <ChevronRight className="w-5 h-5 text-gym-primary" /> : <ChevronDown className="w-5 h-5 text-gym-primary" />}
                Pagos Recientes
              </CardTitle>
            </CardHeader>
            {!collapsePagosRecientes && (
              <CardContent>
                {pagosRecientes.length === 0 ? (
                  <p className="text-center text-gym-muted py-8">{messages.dashboard.noPagosRegistrados}</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {pagosRecientes.map((pago: Payment) => {
                      const detailInfo = pago.detail?.map(d => {
                        const mes = d.month_number ? getMonthName(d.month_number).slice(0, 3) : "";
                        const anio = d.year_number || "";
                        const tipo = d.payment_type === "inscripcion" ? "Insc." : "Mens.";
                        return d.month_number ? `${mes} ${anio} (${tipo})` : tipo;
                      }).join(" | ") || "—";
                      const statusLabel = pago.status === "aprobado" ? "Aprobado" : pago.status === "rechazado" ? "Rechazado" : pago.status === "suspendido" ? "Suspendido" : "Pendiente";
                      return (
                        <div key={pago.id} className="flex items-center justify-between p-3 bg-gym-bg rounded-xl hover:bg-gym-surface/80 transition-colors">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gym-text text-sm truncate">{getNombreMiembro(pago)}</p>
                              <Badge
                                variant={pago.status === "aprobado" ? "success" : pago.status === "rechazado" ? "danger" : pago.status === "suspendido" ? "secondary" : "warning"}
                                className="text-[10px] px-1.5 py-0 flex-shrink-0"
                              >
                                {statusLabel}
                              </Badge>
                            </div>
                            <p className="text-xs text-gym-muted truncate">{detailInfo}</p>
                          </div>
                          <p className="font-semibold text-gym-text text-sm flex-shrink-0 ml-3">
                            {formatCurrency(pago.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <details
            open={!collapseDistHoras}
            onToggle={(e) => setCollapseDistHoras(!(e.target as HTMLDetailsElement).open)}
            className="chart-section mb-4 lg:mb-0 animate-slideUp"
            style={{ animationDelay: "0.3s" }}
          >
            <summary className="p-6 cursor-pointer select-none list-none flex items-center gap-2 font-semibold text-lg text-gym-text [&::-webkit-details-marker]:hidden">
              {collapseDistHoras ? <ChevronRight className="w-5 h-5 text-gym-primary" /> : <ChevronDown className="w-5 h-5 text-gym-primary" />}
              <Zap className="w-4 h-4 text-gym-primary" />
              Distribución por hora
            </summary>
            <div className="px-6 pb-6">
              {hourEntries.length === 0 ? (
                <p className="text-center text-gym-muted py-6">Sin datos de horarios</p>
              ) : (
                <div className="space-y-3">
                  {hourEntries.map(([hour, count]) => (
                    <div key={hour} className="flex items-center gap-3">
                      <span className="text-xs text-gym-muted w-12 text-right font-mono">{hour}</span>
                      <div className="flex-1 h-6 bg-gym-bg rounded-full overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-gym-primary to-gym-secondary rounded-full transition-all duration-700 relative overflow-hidden"
                          style={{ width: `${(count / maxHourCount) * 100}%` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                        </div>
                      </div>
                      <span className="text-xs text-gym-text w-6 text-right font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>

      <Modal isOpen={!!modalData} onClose={() => setModalData(null)} title={modalData?.title}>
        {loadingModal ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-gym-primary border-t-transparent rounded-full" />
          </div>
        ) : modalData?.members.length === 0 ? (
          <p className="text-center text-gym-muted py-8">Sin miembros para mostrar</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {modalData?.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 bg-gym-bg rounded-xl">
                <div className="min-w-0">
                  <p className="font-medium text-gym-text text-sm truncate">{m.nombre}</p>
                  {m.detalle && <p className="text-xs text-gym-muted truncate">{m.detalle}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}