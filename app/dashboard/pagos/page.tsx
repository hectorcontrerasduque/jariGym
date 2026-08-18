"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { miembrosService } from "@/lib/services/miembros/miembros.service";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { Check, X, Eye, CreditCard, Clock, CheckCircle, AlertTriangle, Bell, Calendar, Trash2, FileText, Search } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { Pago, MetodoPago, Profile } from "@/lib/types";
import Link from "next/link";

const metodoLabels: Record<MetodoPago, string> = {
  efectivo: "💵 Efectivo",
  bs: "🇻🇪 Bs",
  binance: "🟡 Binance",
  transferencia: "🏦 Transferencia",
  membresia_libre: "🎁 Libre",
};

function isInscripcion(pago: Pago): boolean {
  return pago.notas?.toLowerCase().includes("inscripción") || pago.notas?.toLowerCase().includes("inscripcion") || false;
}

function getTipoLabel(pago: Pago): string {
  return isInscripcion(pago) ? "Inscripción" : "Mensualidad";
}

export default function PagosPage() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [filtro, setFiltro] = useState<string>("pendiente");
  const [loading, setLoading] = useState(true);
  const [selectedPago, setSelectedPago] = useState<Pago | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [miembroSeleccionado, setMiembroSeleccionado] = useState<string>("");
  const [busquedaMiembro, setBusquedaMiembro] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [anioSeleccionado]);

  useEffect(() => {
    if (busquedaMiembro.length >= 2) {
      const timer = setTimeout(async () => {
        try {
          const results = await miembrosService.buscarMiembros(busquedaMiembro);
          setMiembros(results);
          setShowDropdown(true);
        } catch (error) {
          showToast(messages.toast.errorCargaDatos, "error");
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setMiembros([]);
    }
  }, [busquedaMiembro]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pagosResult, aniosResult] = await Promise.allSettled([
        pagosService.listarPagos(undefined, anioSeleccionado),
        pagosService.aniosConPagos(),
      ]);
      if (pagosResult.status === "fulfilled") setPagos(pagosResult.value);
      if (aniosResult.status === "fulfilled") setAnios(aniosResult.value);
    } catch (error) {
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
    } catch (error) {
      showToast(messages.toast.pagoAprobadoError, "error");
    }
  };

  const handleRechazar = async (pagoId: string) => {
    try {
      await pagosService.rechazarPago(pagoId);
      showToast(messages.toast.pagoRechazado, "success");
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

  const pagosFiltrados = miembroSeleccionado
    ? pagos.filter((p) => p.usuario_id === miembroSeleccionado && (filtro === "todos" || p.estado === filtro))
    : filtro === "todos" ? pagos : pagos.filter((p) => p.estado === filtro);

  const selectedMiembroData = miembros.find((m) => m.id === miembroSeleccionado);
  const isActive = selectedMiembroData?.activo !== false;

  const aprobados = pagosFiltrados.filter((p) => p.estado === "aprobado");
  const pendientes = pagosFiltrados.filter((p) => p.estado === "pendiente");
  const montoAprobado = aprobados.reduce((sum, p) => sum + (p.monto || 0), 0);
  const montoPendiente = pendientes.reduce((sum, p) => sum + (p.monto || 0), 0);

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
          {miembroSeleccionado && isActive && (
            <Link href={`/dashboard/reportar-pago?member=${miembroSeleccionado}`}>
              <Button>
                <Bell className="w-4 h-4 mr-2" />
                Reportar Pago
              </Button>
            </Link>
          )}
          <select
            value={anioSeleccionado}
            onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
            className="px-3 py-2 bg-gym-surface border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary w-auto"
          >
            {anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Member selector - autocomplete */}
      <Card className="neon-card relative z-10">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm font-medium text-gym-muted">Seleccionar Miembro</label>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-muted" />
            <input
              type="text"
              placeholder="Buscar miembro por nombre o email..."
              value={busquedaMiembro}
              onChange={(e) => {
                setBusquedaMiembro(e.target.value);
                setShowDropdown(true);
                if (e.target.value === "") setMiembroSeleccionado("");
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              className="w-full pl-10 pr-4 py-3 bg-gym-bg border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary focus:border-gym-primary"
            />
            {showDropdown && busquedaMiembro.length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gym-surface border border-gym-border rounded-xl shadow-lg z-30 max-h-60 overflow-y-auto">
                {miembros.length > 0 ? (
                  miembros.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMiembroSeleccionado(m.id);
                        setBusquedaMiembro(`${m.nombre_completo} (${m.email || "sin email"})`);
                        setShowDropdown(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gym-bg transition-colors flex items-center gap-3"
                    >
                      <div className="w-8 h-8 bg-gym-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-gym-primary">
                          {m.nombre_completo.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gym-text truncate">{m.nombre_completo}</p>
                        <p className="text-xs text-gym-muted truncate">{m.email || "sin email"} {m.activo === false ? "[Inactivo]" : ""}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-gym-muted text-center">No se encontraron miembros</div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
      <div className="flex gap-2 overflow-x-auto pb-2 relative z-10">
        {["todos", "pendiente", "aprobado", "rechazado"].map((f) => (
          <Button
            key={f}
            variant={filtro === f ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFiltro(f)}
            className="whitespace-nowrap"
          >
            {f === "todos" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "pendiente" && pendientes.length > 0 && ` (${pendientes.length})`}
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
              {miembroSeleccionado ? `Pagos de ${selectedMiembroData?.nombre_completo || ""}` : "Todos los Pagos"}
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
                        {pago.profile?.nombre_completo || "—"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
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
                              : "warning"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {pago.estado === "aprobado"
                            ? "Aprobado"
                            : pago.estado === "rechazado"
                            ? "Rechazado"
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
                        className="p-1.5 text-gym-muted hover:text-gym-text rounded-lg transition-colors"
                        title="Ver detalle"
                      >
                        <Eye className="w-4 h-4" />
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
              <p className="text-gym-text font-medium">{selectedPago.profile?.nombre_completo || "—"}</p>
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
            {selectedPago.codigo_billete && (
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
            {selectedPago.notas && (
              <div>
                <p className="text-sm text-gym-muted">Notas</p>
                <p className="text-gym-text">{selectedPago.notas}</p>
              </div>
            )}
            {selectedPago.estado === "pendiente" && (
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
    </div>
  );
}
