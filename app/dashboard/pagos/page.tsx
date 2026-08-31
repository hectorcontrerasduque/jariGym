"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { miembrosService } from "@/lib/services/miembros/miembros.service";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { Check, X, Eye, CreditCard, Clock, CheckCircle, AlertTriangle, Bell, Search, Plus } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { Payment, MetodoPago, Profile } from "@/lib/types";
import Link from "next/link";

const metodoLabels: Record<MetodoPago, string> = {
  efectivo: "💵 Efectivo",
  bs: "🇻🇪 Bs",
  binance: "🟡 Binance",
};

function isInscripcion(pago: Payment): boolean {
  return pago.detail?.some(d => d.payment_type === "inscripcion") || false;
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

export default function PagosPage() {
  const [pagos, setPagos] = useState<Payment[]>([]);
  const [filtro, setFiltro] = useState<string>("todos");
  const [loading, setLoading] = useState(true);
  const [selectedPago, setSelectedPago] = useState<Payment | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [mesSeleccionado, setMesSeleccionado] = useState<number>(0);
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [miembroSeleccionado] = useState<string>("");
  const [busquedaMiembro, setBusquedaMiembro] = useState("");

  const fetchAllData = useCallback(async () => {
    return await Promise.allSettled([
      pagosService.listarPagos(undefined, anioSeleccionado, mesSeleccionado === 0 ? undefined : mesSeleccionado),
      pagosService.aniosConPagos(),
      miembrosService.listarMiembros(),
    ]);
  }, [anioSeleccionado, mesSeleccionado]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [pagosResult, aniosResult, miembrosResult] = await fetchAllData();
        if (!cancelled) {
          if (pagosResult.status === "fulfilled") setPagos(pagosResult.value);
          if (aniosResult.status === "fulfilled") {
            setAnios(aniosResult.value);
            // Auto-select a year that has payments if the current year has none
            if (aniosResult.value.length > 0 && !aniosResult.value.includes(anioSeleccionado)) {
              setAnioSeleccionado(aniosResult.value[0]);
            }
          }
          if (miembrosResult.status === "fulfilled") setMiembros(miembrosResult.value);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error cargando datos de pagos:", err);
          showToast(messages.toast.errorCargaDatos, "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fetchAllData, anioSeleccionado]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pagosResult, aniosResult, miembrosResult] = await fetchAllData();
      if (pagosResult.status === "fulfilled") setPagos(pagosResult.value);
      if (aniosResult.status === "fulfilled") setAnios(aniosResult.value);
      if (miembrosResult.status === "fulfilled") setMiembros(miembrosResult.value);
    } catch {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAprobar = async (pagoId: string) => {
    try {
      await pagosService.aprobarPago(pagoId);
      showToast(messages.toast.pagoAprobado, "success");
      await loadData();
      setModalOpen(false);
    } catch {
      showToast(messages.toast.pagoAprobadoError, "error");
    }
  };

  const handleRechazar = async (pagoId: string) => {
    try {
      await pagosService.rechazarPago(pagoId);
      showToast(messages.toast.pagoRechazado, "success");
      await loadData();
      setModalOpen(false);
    } catch {
      showToast(messages.toast.pagoRechazadoError, "error");
    }
  };

  const pagosFiltrados = (() => {
    let result = filtro === "todos"
      ? pagos
      : filtro === "rechazados_suspendidos"
      ? pagos.filter((p) => p.status === "rechazado" || p.status === "suspendido")
      : pagos.filter((p) => p.status === filtro);
    if (busquedaMiembro) {
      const q = busquedaMiembro.toLowerCase();
      const matchedMiembroIds = miembros
        .filter((m) => m.full_name.toLowerCase().includes(q) || (m.email && m.email.toLowerCase().includes(q)))
        .map((m) => m.id);
      result = result.filter((p) => matchedMiembroIds.includes(p.user_id));
    }
    if (miembroSeleccionado) {
      result = result.filter((p) => p.user_id === miembroSeleccionado);
    }
    return result;
  })();

  const selectedMiembroData = miembros.find((m) => m.id === miembroSeleccionado);
  const isActive = selectedMiembroData?.activo !== false;

  const aprobados = pagosFiltrados.filter((p) => p.status === "aprobado");
  const pendientes = pagosFiltrados.filter((p) => p.status === "pendiente");
  const montoAprobado = aprobados.reduce((sum, p) => sum + getTotalMonto(p), 0);
  const montoPendiente = pendientes.reduce((sum, p) => sum + getTotalMonto(p), 0);

  const getNombreMiembro = (pago: Payment): string => {
    if (pago.profile?.full_name) return pago.profile.full_name;
    const miembro = miembros.find((m) => m.id === pago.user_id);
    return miembro?.full_name || "—";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn relative">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Pagos</h1>
          <p className="text-gym-muted text-sm">Gestiona los pagos de tus miembros</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/mis-pagos" className="hidden sm:block">
            <Button>
              <CreditCard className="w-4 h-4 mr-2" />
              Generar pagos
            </Button>
          </Link>
          {miembroSeleccionado && isActive && (
            <Link href={`/dashboard/reportar-pago?member=${miembroSeleccionado}`}>
              <Button>
                <Bell className="w-4 h-4 mr-2" />
                Reportar Pago
              </Button>
            </Link>
          )}
          <div className="flex gap-2">
            <select
              value={anioSeleccionado}
              onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
              className="px-3 py-2 bg-gym-primary/10 border border-gym-primary/30 rounded-xl text-gym-text text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gym-primary"
            >
              {anios.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(Number(e.target.value))}
              className="px-3 py-2 bg-gym-primary/10 border border-gym-primary/30 rounded-xl text-gym-text text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gym-primary"
            >
              <option value={0}>Todos</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{getMonthName(m)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Member filter */}
      <div className="relative z-10">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gym-muted" />
        <input
          type="text"
          placeholder="Filtrar por nombre o correo del miembro..."
          value={busquedaMiembro}
          onChange={(e) => setBusquedaMiembro(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-transparent border-0 border-b border-gym-border text-gym-text placeholder:text-gym-muted focus:outline-none focus:ring-0 focus:border-gym-primary"
        />
      </div>

      {/* Alert for inactive member */}
      {miembroSeleccionado && !isActive && (
        <Card className="neon-border-warning relative z-10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-gym-warning flex-shrink-0" />
              <div>
                <p className="font-medium text-gym-text">Miembro Inactivo</p>
                <p className="text-sm text-gym-muted">Este miembro está inactivo. Actívalo desde la sección de Miembros para poder reportar pagos.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-1 sm:gap-3 relative z-10">
        {[
          { key: "todos", label: "Todos" },
          { key: "pendiente", label: "Pendiente" },
          { key: "aprobado", label: "Aprobado" },
          { key: "rechazados_suspendidos", label: "Rechazados/Suspendidos" },
        ].map((f) => (
          <Button
            key={f.key}
            variant={filtro === f.key ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFiltro(f.key)}
            className="px-2 sm:px-4 py-1 sm:py-2 text-[10px] sm:text-sm whitespace-nowrap"
          >
            {f.label}
            {f.key === "pendiente" && pendientes.length > 0 && ` (${pendientes.length})`}
          </Button>
        ))}
      </div>

      {/* Stats */}
      {miembroSeleccionado && (
        <div className="grid grid-cols-3 gap-3 relative z-10">
          <Card className="neon-card">
            <CardContent className="p-3 text-center">
              <CheckCircle className="w-4 h-4 text-gym-success mx-auto mb-1" />
              <p className="text-lg font-bold text-gym-success">{formatCurrency(montoAprobado)}</p>
              <p className="text-xs text-gym-muted">Aprobado</p>
            </CardContent>
          </Card>
          <Card className="neon-card">
            <CardContent className="p-3 text-center">
              <Clock className="w-4 h-4 text-gym-warning mx-auto mb-1" />
              <p className="text-lg font-bold text-gym-warning">{formatCurrency(montoPendiente)}</p>
              <p className="text-xs text-gym-muted">Pendiente</p>
            </CardContent>
          </Card>
          <Card className="neon-card">
            <CardContent className="p-3 text-center">
              <CreditCard className="w-4 h-4 text-gym-primary mx-auto mb-1" />
              <p className="text-lg font-bold text-gym-text">{formatCurrency(montoAprobado + montoPendiente)}</p>
              <p className="text-xs text-gym-muted">Total</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pagos list */}
      <Card className="neon-card relative z-10">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-gym-primary" />
              {busquedaMiembro ? `Pagos filtrados` : "Todos los Pagos"}
            </div>
            <span className="text-sm font-normal text-gym-muted">{pagosFiltrados.length} pago(s)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pagosFiltrados.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 text-gym-muted mx-auto mb-3" />
              <p className="text-gym-muted">No hay pagos registrados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pagosFiltrados.map((pago) => (
                <div
                  key={pago.id}
                  className="p-3 bg-gym-bg rounded-xl hover:bg-gym-surface transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gym-text truncate">
                        {getNombreMiembro(pago)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gym-muted">{getPagoMesesInfo(pago)}</span>
                        <span className="text-xs text-gym-muted">·</span>
                        <span className={`text-xs ${isInscripcion(pago) ? "text-gym-primary" : "text-gym-secondary"}`}>
                          {getTipoLabel(pago)}
                        </span>
                        <span className="text-xs text-gym-muted">·</span>
                        <Badge
                          variant={
                            pago.status === "aprobado"
                              ? "success"
                              : pago.status === "rechazado"
                              ? "danger"
                              : "warning"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {pago.status === "aprobado"
                            ? "Aprobado"
                            : pago.status === "rechazado"
                            ? "Rechazado"
                            : pago.status === "suspendido"
                            ? "Suspendido"
                            : "Pendiente"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-gym-text text-sm">
                        {getTotalMonto(pago) > 0 ? formatCurrency(getTotalMonto(pago)) : "Gratis"}
                      </span>
                      <button
                        onClick={() => { setSelectedPago(pago); setModalOpen(true); }}
                        className="p-2 text-gym-muted hover:text-gym-text rounded-lg transition-colors ml-2"
                        title="Ver detalle"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Detalle del Pago">
        {selectedPago && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gym-muted">Miembro</p>
              <p className="text-gym-text font-medium">{getNombreMiembro(selectedPago)}</p>
            </div>
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
              <p className="text-sm text-gym-muted">Método</p>
              <p className="text-gym-text">{metodoLabels[selectedPago.payment_method]}</p>
            </div>
            {selectedPago.bill_code && selectedPago.payment_method === "efectivo" && (
              <div>
                <p className="text-sm text-gym-muted">Código billete</p>
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
            {(selectedPago.status === "pendiente") && (
              <div className="flex gap-2 pt-4">
                <Button className="flex-1 glow-success" onClick={() => handleAprobar(selectedPago.id)}>
                  <Check className="w-4 h-4 mr-2" /> Aprobar
                </Button>
                <Button variant="danger" className="flex-1 glow-danger" onClick={() => handleRechazar(selectedPago.id)}>
                  <X className="w-4 h-4 mr-2" /> Rechazar
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Mobile floating Generar pagos button */}
      <Link href="/dashboard/mis-pagos" className="sm:hidden fixed bottom-20 right-4 z-40">
        <div className="w-14 h-14 rounded-full bg-gym-success text-white shadow-lg shadow-gym-success/30 flex items-center justify-center active:scale-95 transition-all">
          <Plus className="w-6 h-6" />
        </div>
      </Link>
    </div>
  );
}
