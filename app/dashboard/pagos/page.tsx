"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { miembrosService } from "@/lib/services/miembros/miembros.service";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { Check, X, Eye, CreditCard, Clock, CheckCircle, AlertTriangle, Bell, Calendar, Trash2, FileText, Search, Plus } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { Pago, MetodoPago, Profile } from "@/lib/types";
import Link from "next/link";

const metodoLabels: Record<MetodoPago, string> = {
  efectivo: "💵 Efectivo",
  bs: "🇻🇪 Bs",
  binance: "🟡 Binance",
};

function isInscripcion(pago: Pago): boolean {
  return pago.notas?.toLowerCase().includes("inscripción") || pago.notas?.toLowerCase().includes("inscripcion") || false;
}

function getTipoLabel(pago: Pago): string {
  return isInscripcion(pago) ? "Inscripción" : "Mensualidad";
}

export default function PagosPage() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [filtro, setFiltro] = useState<string>("todos");
  const [loading, setLoading] = useState(true);
  const [selectedPago, setSelectedPago] = useState<Pago | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [mesSeleccionado, setMesSeleccionado] = useState<number>(0);
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [miembroSeleccionado, setMiembroSeleccionado] = useState<string>("");
  const [busquedaMiembro, setBusquedaMiembro] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pagosResult, aniosResult, miembrosResult] = await Promise.allSettled([
        pagosService.listarPagos(undefined, anioSeleccionado, mesSeleccionado === 0 ? undefined : mesSeleccionado),
        pagosService.aniosConPagos(),
        miembrosService.listarMiembros(),
      ]);
      if (pagosResult.status === "fulfilled") setPagos(pagosResult.value);
      if (aniosResult.status === "fulfilled") setAnios(aniosResult.value);
      if (miembrosResult.status === "fulfilled") setMiembros(miembrosResult.value);
    } catch (error) {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  }, [anioSeleccionado, mesSeleccionado]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAprobar = async (pagoId: string) => {
    try {
      const pago = pagos.find(p => p.id === pagoId);
      await pagosService.aprobarPago(pagoId);
      if (pago?.estado === "suspendido_pendiente") {
        showToast(messages.toast.suspensionAprobada, "success");
      } else {
        showToast(messages.toast.pagoAprobado, "success");
      }
      await loadData();
      setModalOpen(false);
    } catch (error) {
      showToast(messages.toast.pagoAprobadoError, "error");
    }
  };

  const handleRechazar = async (pagoId: string) => {
    try {
      const pago = pagos.find(p => p.id === pagoId);
      await pagosService.rechazarPago(pagoId);
      if (pago?.estado === "suspendido_pendiente") {
        showToast(messages.toast.suspensionRechazada, "success");
      } else {
        showToast(messages.toast.pagoRechazado, "success");
      }
      await loadData();
      setModalOpen(false);
    } catch (error) {
      showToast(messages.toast.pagoRechazadoError, "error");
    }
  };

  const handleDelete = async (pagoId: string) => {
    if (!confirm(messages.pagos.eliminarPagoConfirm)) return;
    setDeleting(pagoId);
    try {
      await pagosService.eliminarPago(pagoId);
      showToast(messages.toast.pagoEliminado, "success");
      await loadData();
    } catch (err) {
      showToast(messages.toast.pagoEliminadoError, "error");
    } finally {
      setDeleting(null);
    }
  };

  const pagosFiltrados = (() => {
    let result = filtro === "todos"
      ? pagos
      : filtro === "rechazados_suspendidos"
      ? pagos.filter((p) => p.estado === "rechazado" || p.estado === "suspendido")
      : pagos.filter((p) => p.estado === filtro);
    if (busquedaMiembro) {
      const q = busquedaMiembro.toLowerCase();
      const matchedMiembroIds = miembros
        .filter((m) => m.nombre_completo.toLowerCase().includes(q) || (m.email && m.email.toLowerCase().includes(q)))
        .map((m) => m.id);
      result = result.filter((p) => matchedMiembroIds.includes(p.usuario_id));
    }
    if (miembroSeleccionado) {
      result = result.filter((p) => p.usuario_id === miembroSeleccionado);
    }
    return result;
  })();

  const selectedMiembroData = miembros.find((m) => m.id === miembroSeleccionado);
  const isActive = selectedMiembroData?.activo !== false;

  const aprobados = pagosFiltrados.filter((p) => p.estado === "aprobado");
  const pendientes = pagosFiltrados.filter((p) => p.estado === "pendiente");
  const montoAprobado = aprobados.reduce((sum, p) => sum + (p.monto || 0), 0);
  const montoPendiente = pendientes.reduce((sum, p) => sum + (p.monto || 0), 0);

  const getNombreMiembro = (pago: Pago): string => {
    if (pago.profile?.nombre_completo) return pago.profile.nombre_completo;
    const miembro = miembros.find((m) => m.id === pago.usuario_id);
    return miembro?.nombre_completo || "—";
  };

  const getAvatarMiembro = (pago: Pago): string | undefined => {
    if (pago.profile?.avatar_url) return pago.profile.avatar_url;
    const miembro = miembros.find((m) => m.id === pago.usuario_id);
    return miembro?.avatar_url ?? undefined;
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
                        <span className="text-xs text-gym-muted">{getMonthName(pago.mes_pagar)} {pago.anio_pagar}</span>
                        <span className="text-xs text-gym-muted">·</span>
                        <span className={`text-xs ${isInscripcion(pago) ? "text-gym-primary" : "text-gym-secondary"}`}>
                          {getTipoLabel(pago)}
                        </span>
                        <span className="text-xs text-gym-muted">·</span>
                        <Badge
                          variant={
                            pago.estado === "aprobado"
                              ? "success"
                              : pago.estado === "rechazado"
                              ? "danger"
                              : pago.estado === "suspendido"
                              ? "warning"
                              : pago.estado === "suspendido_pendiente"
                              ? "warning"
                              : "warning"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {pago.estado === "aprobado"
                            ? "Aprobado"
                            : pago.estado === "rechazado"
                            ? "Rechazado"
                            : pago.estado === "suspendido"
                            ? "Suspendido"
                            : pago.estado === "suspendido_pendiente"
                            ? "Susp. Pendiente"
                            : "Pendiente"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-gym-text text-sm">
                        {pago.monto > 0 ? formatCurrency(pago.monto) : "Gratis"}
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
              <p className="text-gym-text font-medium">{getMonthName(selectedPago.mes_pagar)} {selectedPago.anio_pagar}</p>
            </div>
            <div>
              <p className="text-sm text-gym-muted">Tipo</p>
              <p className="text-gym-text">{getTipoLabel(selectedPago)}</p>
            </div>
            <div>
              <p className="text-sm text-gym-muted">Monto</p>
              <p className="text-2xl font-bold text-gym-text neon-text">{formatCurrency(selectedPago.monto)}</p>
            </div>
            <div>
              <p className="text-sm text-gym-muted">Método</p>
              <p className="text-gym-text">{metodoLabels[selectedPago.metodo_pago]}</p>
            </div>
            {selectedPago.codigo_billete && selectedPago.metodo_pago === "efectivo" && (
              <div>
                <p className="text-sm text-gym-muted">Código billete</p>
                <p className="text-gym-text font-mono">{selectedPago.codigo_billete}</p>
              </div>
            )}
            {selectedPago.fecha_pago_real && (
              <div>
                <p className="text-sm text-gym-muted">Fecha de pago</p>
                <p className="text-gym-text">{new Date(selectedPago.fecha_pago_real).toLocaleDateString("es-ES")}</p>
              </div>
            )}
            {selectedPago.comprobante_url && (
              <div>
                <p className="text-sm text-gym-muted mb-2">Comprobante</p>
                <a href={selectedPago.comprobante_url} target="_blank" rel="noopener noreferrer" className="text-gym-primary hover:underline">
                  Ver comprobante
                </a>
              </div>
            )}
            <div>
              <p className="text-sm text-gym-muted">Notas</p>
              <p className="text-gym-text">{selectedPago.notas || "—"}</p>
            </div>
            {(selectedPago.estado === "pendiente" || selectedPago.estado === "suspendido_pendiente") && (
              <div className="flex gap-2 pt-4">
                <Button className="flex-1 glow-success" onClick={() => handleAprobar(selectedPago.id)}>
                  <Check className="w-4 h-4 mr-2" /> {selectedPago.estado === "suspendido_pendiente" ? messages.misPagos.aprobarSuspension : "Aprobar"}
                </Button>
                <Button variant="danger" className="flex-1 glow-danger" onClick={() => handleRechazar(selectedPago.id)}>
                  <X className="w-4 h-4 mr-2" /> {selectedPago.estado === "suspendido_pendiente" ? messages.misPagos.rechazarSuspension : "Rechazar"}
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
