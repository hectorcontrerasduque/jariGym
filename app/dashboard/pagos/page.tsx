"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { pagosService } from "@/lib/features/pagos/service";
import { bolivaresService } from "@/lib/features/pagos/bolivares.service";
import { miembrosService } from "@/lib/services/miembros/miembros.service";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { Check, X, Eye, CreditCard, Clock, CheckCircle, AlertTriangle, Search, Plus, Link2 } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { messages, mensaje } from "@/lib/messages";
import { Loader } from "@/components/ui/loader";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import type { Payment, MetodoPago, Profile, PaymentBolivar } from "@/lib/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const metodoLabels: Record<MetodoPago, string> = {
  efectivo: "💵 Efectivo",
  bs: "🇻🇪 Bs",
  binance: "🟡 Binance",
};

function isInscripcion(pago: Payment): boolean {
  return pago.detail?.some(d => d.payment_type === "inscripcion") || false;
}

function getTipoLabel(pago: Payment): string {
  if (isInscripcion(pago)) return "Inscripción";
  if (pago.detail?.some(d => d.payment_type === "suspension")) return "Suspensión";
  return "Mensualidad";
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
    const tipo = d.payment_type === "inscripcion" ? "Inscripción" : d.payment_type === "suspension" ? "Suspensión" : "Mensualidad";
    parts.push(`${mes} ${d.year_number} (${tipo})`);
  }
  
  return parts.join(" | ") || "—";
}

function PagosContent() {
  const searchParams = useSearchParams();
  const memberFromUrl = searchParams.get("member") || "";
  const [pagos, setPagos] = useState<Payment[]>([]);
  const [filtro, setFiltro] = useState<string>("todos");
  const [loading, setLoading] = useState(true);
  const [selectedPago, setSelectedPago] = useState<Payment | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [mesSeleccionado, setMesSeleccionado] = useState<number>(0);
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [miembroSeleccionado] = useState<string>(memberFromUrl);
  const [busquedaMiembro, setBusquedaMiembro] = useState("");
  const pagination = usePagination(25);

  // ── Conciliación BS (payment_bolivares) en el modal Detalle ──────────────
  const [bolivaresSel, setBolivaresSel] = useState<PaymentBolivar[] | null>(null);
  const [urlImagenSel, setUrlImagenSel] = useState<string | null>(null);
  const [imagenExpandida, setImagenExpandida] = useState(false);
  const [conciliando, setConciliando] = useState(false);

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
            if (aniosResult.value.length > 0 && !aniosResult.value.includes(anioSeleccionado)) {
              setAnioSeleccionado(aniosResult.value[0]);
            }
          }
          if (miembrosResult.status === "fulfilled") {
            setMiembros(miembrosResult.value);
            if (memberFromUrl && !busquedaMiembro) {
              const miembro = miembrosResult.value.find((m) => m.id === memberFromUrl);
              if (miembro) setBusquedaMiembro(miembro.full_name);
            }
          }
        }
      } catch {
        if (!cancelled) {
          showToast(messages.toast.errorCargaDatos, "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAllData, anioSeleccionado]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { pagination.resetPage(); }, [filtro, busquedaMiembro]);

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
      const pago = pagos.find((p) => p.id === pagoId);
      // ── BS: conciliación propia (marca reconciled + aprueba solo si la suma
      // de amount_usd reconciliados cubre el monto configurado por mes/tipo).
      if (pago?.payment_method === "bs") {
        setConciliando(true);
        try {
          const resultado = await bolivaresService.reconciliarPago(pagoId);
          if (resultado.aprobado) {
            fetch("/api/pagos/notify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pagoId }),
            }).catch(() => {});
            showToast(messages.bolivares.conciliado, "success");
          } else {
            showToast(
              mensaje(messages.bolivares.conciliadoParcial, {
                restante: formatCurrency(resultado.restanteUsd),
              }),
              "warning"
            );
          }
          await loadData();
          setModalOpen(false);
        } finally {
          setConciliando(false);
        }
        return;
      }
      await pagosService.aprobarPago(pagoId);
      fetch("/api/pagos/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagoId }),
      }).catch(() => {});
      showToast(messages.toast.pagoAprobado, "success");
      await loadData();
      setModalOpen(false);
    } catch {
      showToast(
        pagos.find((p) => p.id === pagoId)?.payment_method === "bs"
          ? messages.bolivares.conciliacionError
          : messages.toast.pagoAprobadoError,
        "error"
      );
    } finally {
      setConciliando(false);
    }
  };

  const handleRechazar = async (pagoId: string) => {
    try {
      const pago = pagos.find((p) => p.id === pagoId);
      await pagosService.rechazarPago(pagoId);
      // BS rechazado: la imagen ya no sirve — borrarla (best-effort).
      if (pago?.payment_method === "bs") {
        await bolivaresService.borrarImagenesDePago(pagoId).catch(() => {});
      }
      fetch("/api/pagos/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagoId }),
      }).catch(() => {});
      showToast(messages.toast.pagoRechazado, "success");
      await loadData();
      setModalOpen(false);
    } catch {
      showToast(messages.toast.pagoRechazadoError, "error");
    }
  };

  // Al abrir Detalle de un pago BS: traer payment_bolivares + firmar imagen.
  // (Reset al abrir el modal en el onClick — regla react-hooks/set-state-in-effect.)
  useEffect(() => {
    if (!modalOpen || !selectedPago || selectedPago.payment_method !== "bs") return;
    let cancelado = false;
    (async () => {
      try {
        const filas = await bolivaresService.obtenerDePago(selectedPago.id);
        if (cancelado) return;
        setBolivaresSel(filas);
        const ruta = filas.find((f) => f.image_url)?.image_url;
        if (ruta) {
          const url = await bolivaresService.firmarImagen(ruta);
          if (!cancelado) setUrlImagenSel(url);
        }
      } catch {
        if (!cancelado) setBolivaresSel([]);
      }
    })();
    return () => { cancelado = true; };
  }, [modalOpen, selectedPago]);

  const pagosFiltrados = useMemo(() => {
    let result = filtro === "todos"
      ? pagos
      : filtro === "rechazados"
      ? pagos.filter((p) => p.status === "rechazado")
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
  }, [pagos, filtro, busquedaMiembro, miembroSeleccionado, miembros]);

  const pagosPaginados = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    return pagosFiltrados.slice(start, start + pagination.pageSize);
  }, [pagosFiltrados, pagination.page, pagination.pageSize]);

  useEffect(() => {
    pagination.setTotalItems(pagosFiltrados.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagosFiltrados.length]);

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
    return <Loader show={true} />;
  }

  return (
    <>
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
          <div className="flex gap-2">
            <select
              id="anio-pagos"
              name="anio"
              value={anioSeleccionado}
              onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
              className="px-3 py-2 bg-gym-primary/10 border border-gym-primary/30 rounded-xl text-gym-text text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gym-primary"
            >
              {anios.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              id="mes-pagos"
              name="mes"
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
          { key: "rechazados", label: "Rechazados" },
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
              {pagosPaginados.map((pago) => (
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
                            : "Pendiente"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-gym-text text-sm">
                        {getTotalMonto(pago) > 0 ? formatCurrency(getTotalMonto(pago)) : "Gratis"}
                      </span>
                      <button
                        onClick={() => { setSelectedPago(pago); setBolivaresSel(null); setUrlImagenSel(null); setImagenExpandida(false); setModalOpen(true); }}
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
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
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
            {/* ── Datos payment_bolivares + imagen expandible + conciliación ── */}
            {selectedPago.payment_method === "bs" && (
              <div className="p-3 bg-gym-bg rounded-xl border border-gym-border space-y-3">
                <p className="text-sm font-medium text-gym-muted">{messages.bolivares.datosBs}</p>
                {bolivaresSel === null ? (
                  <p className="text-xs text-gym-muted">Cargando…</p>
                ) : bolivaresSel.length === 0 ? (
                  <p className="text-xs text-gym-muted">—</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <span className="text-gym-muted">
                        {messages.bolivares.montoBs}:{' '}
                        <span className="text-gym-text font-semibold">
                          {bolivaresSel.reduce((s, b) => s + Number(b.amount_bs || 0), 0).toLocaleString("es-VE")} Bs
                        </span>
                      </span>
                      <span className="text-gym-muted">
                        {messages.bolivares.tasaBcvLabel}:{' '}
                        <span className="text-gym-text">{bolivaresSel[0].rate_bcv} Bs/USD</span>
                      </span>
                      <span className="text-gym-muted">
                        {messages.bolivares.montoUsdEquiv}:{' '}
                        <span className="text-gym-text">{formatCurrency(bolivaresSel.reduce((s, b) => s + Number(b.amount_usd || 0), 0))}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <span className="text-gym-muted">
                        {messages.bolivares.banco}:{' '}
                        <span className="text-gym-text">{bolivaresSel[0].bank || messages.bolivares.bancoNoEspecificado}</span>
                      </span>
                      <span className="text-gym-muted">
                        {messages.bolivares.referencia}:{' '}
                        <span className="text-gym-text font-mono">{bolivaresSel[0].reference_number || messages.bolivares.referenciaNoEspecificada}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="text-gym-muted">Estado:</span>
                      <Badge variant={bolivaresSel[0].reconciled ? "success" : "warning"} className="text-[10px]">
                        {bolivaresSel[0].reconciled ? messages.bolivares.reconciledLabel : messages.bolivares.sinConciliar}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-gym-muted">{messages.bolivares.pagoParcialInfo}</p>
                    {urlImagenSel ? (
                      <div>
                        <p className="text-xs text-gym-muted mb-1">{messages.bolivares.verImagen}</p>
                        <button
                          type="button"
                          onClick={() => setImagenExpandida(true)}
                          className="block w-full max-w-xs rounded-lg overflow-hidden border border-gym-border hover:border-gym-primary transition-colors"
                          title={messages.bolivares.verImagen}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL temporal */}
                          <img src={urlImagenSel} alt="Comprobante pago Bs" className="w-full h-auto" />
                        </button>
                      </div>
                    ) : bolivaresSel[0].image_url ? (
                      <p className="text-xs text-gym-muted">{messages.bolivares.imagenNoDisponible}</p>
                    ) : null}
                  </>
                )}
              </div>
            )}
            <div>
              <p className="text-sm text-gym-muted">Notas</p>
              <p className="text-gym-text">{selectedPago.payment_note || "—"}</p>
            </div>
            {(selectedPago.status === "pendiente") && (
              <div className="flex gap-2 pt-4">
                <Button
                  className="flex-1 glow-success"
                  onClick={() => handleAprobar(selectedPago.id)}
                  loading={conciliando}
                  disabled={conciliando}
                >
                  {selectedPago.payment_method === "bs" ? (
                    <>
                      <Link2 className="w-4 h-4 mr-2" />
                      {conciliando ? messages.bolivares.conciliando : messages.bolivares.conciliar}
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" /> Aprobar
                    </>
                  )}
                </Button>
                <Button variant="danger" className="flex-1 glow-danger" onClick={() => handleRechazar(selectedPago.id)} disabled={conciliando}>
                  <X className="w-4 h-4 mr-2" /> Rechazar
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Imagen del comprobante BS a tamaño completa */}
      {imagenExpandida && urlImagenSel && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setImagenExpandida(false)}
          role="dialog"
          aria-modal="true"
          aria-label={messages.bolivares.verImagen}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
            onClick={() => setImagenExpandida(false)}
            aria-label={messages.bolivares.cerrarImagen}
          >
            <X className="w-6 h-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL temporal */}
          <img
            src={urlImagenSel}
            alt="Comprobante pago Bs"
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>

      {/* Mobile floating Generar pagos button */}
      <Link href="/dashboard/mis-pagos" className="sm:hidden fixed bottom-24 right-4 z-[60]">
        <div className="w-14 h-14 rounded-full bg-gym-success text-white shadow-lg shadow-gym-success/30 flex items-center justify-center active:scale-95 transition-all">
          <Plus className="w-6 h-6" />
        </div>
      </Link>
    </>
  );
}

export default function PagosPage() {
  return (
    <Suspense fallback={<Loader show={true} />}>
      <PagosContent />
    </Suspense>
  );
}
