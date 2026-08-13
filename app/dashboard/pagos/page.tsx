"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { Check, X, Eye } from "lucide-react";
import type { Pago, MetodoPago } from "@/lib/types";

const metodoLabels: Record<MetodoPago, string> = {
  efectivo: "💵 Efectivo",
  bs: "🇻🇪 Bs",
  binance: "🟡 Binance",
  transferencia: "🏦 Transferencia",
  membresia_libre: "🎁 Libre",
};

export default function PagosPage() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [filtro, setFiltro] = useState<string>("todos");
  const [loading, setLoading] = useState(true);
  const [selectedPago, setSelectedPago] = useState<Pago | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());

  useEffect(() => { loadData(); }, [anioSeleccionado]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [data, aniosData] = await Promise.all([
        pagosService.listarPagos(undefined, anioSeleccionado),
        pagosService.aniosConPagos(),
      ]);
      setPagos(data);
      setAnios(aniosData);
    } catch (error) {
      console.error("Error loading pagos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAprobar = async (pagoId: string) => {
    try {
      await pagosService.aprobarPago(pagoId);
      await loadData();
      setModalOpen(false);
    } catch (error) {
      console.error("Error approving:", error);
    }
  };

  const handleRechazar = async (pagoId: string) => {
    try {
      await pagosService.rechazarPago(pagoId);
      await loadData();
      setModalOpen(false);
    } catch (error) {
      console.error("Error rejecting:", error);
    }
  };

  const pagosFiltrados = filtro === "todos" ? pagos : pagos.filter((p) => p.estado === filtro);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gym-primary/5 rounded-full blur-3xl animate-pulse" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Pagos</h1>
          <p className="text-gym-muted text-sm">Gestiona los pagos de tus miembros</p>
        </div>
        <select
          value={anioSeleccionado}
          onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
          className="px-4 py-2 bg-gym-surface border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary"
        >
          {anios.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

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
          </Button>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block neon-card relative z-10">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gym-border text-left text-xs text-gym-muted">
                  <th className="px-4 py-3">Miembro</th>
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gym-border">
                {pagosFiltrados.map((pago) => (
                  <tr key={pago.id} className="hover:bg-gym-bg/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gym-text text-sm">{pago.profile?.nombre_completo || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gym-muted">
                      {getMonthName(pago.mes_pagar)} {pago.anio_pagar}
                    </td>
                    <td className="px-4 py-3 text-sm">{metodoLabels[pago.metodo_pago]}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gym-muted">{pago.codigo_billete || "—"}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{formatCurrency(pago.monto)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={pago.estado === "aprobado" ? "success" : pago.estado === "rechazado" ? "danger" : "warning"}>
                        {pago.estado}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedPago(pago); setModalOpen(true); }}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {pago.estado === "pendiente" && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleAprobar(pago.id)} className="text-gym-success hover:text-gym-success">
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleRechazar(pago.id)} className="text-gym-danger hover:text-gym-danger">
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3 relative z-10">
        {pagosFiltrados.map((pago) => (
          <Card key={pago.id} className="neon-card">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0">
                  <p className="font-medium text-gym-text truncate">{pago.profile?.nombre_completo || "—"}</p>
                  <p className="text-xs text-gym-muted">{getMonthName(pago.mes_pagar)} {pago.anio_pagar}</p>
                </div>
                <Badge variant={pago.estado === "aprobado" ? "success" : pago.estado === "rechazado" ? "danger" : "warning"}>
                  {pago.estado}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-gym-muted">{metodoLabels[pago.metodo_pago]}</span>
                  {pago.codigo_billete && <span className="ml-2 font-mono text-xs">#{pago.codigo_billete}</span>}
                </div>
                <span className="font-semibold text-gym-text">{formatCurrency(pago.monto)}</span>
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setSelectedPago(pago); setModalOpen(true); }}>
                  <Eye className="w-4 h-4 mr-1" /> Ver
                </Button>
                {pago.estado === "pendiente" && (
                  <>
                    <Button variant="ghost" size="sm" className="text-gym-success" onClick={() => handleAprobar(pago.id)}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-gym-danger" onClick={() => handleRechazar(pago.id)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {pagosFiltrados.length === 0 && (
        <p className="text-center text-gym-muted py-12 relative z-10">No hay pagos con este filtro</p>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Detalle del Pago">
        {selectedPago && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gym-muted">Miembro</p>
              <p className="text-gym-text">{selectedPago.profile?.nombre_completo}</p>
            </div>
            <div>
              <p className="text-sm text-gym-muted">Período</p>
              <p className="text-gym-text">{getMonthName(selectedPago.mes_pagar)} {selectedPago.anio_pagar}</p>
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
