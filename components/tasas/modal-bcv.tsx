"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { formatDateTime } from "@/lib/utils";
import type { TasaFila } from "@/lib/features/tasas/domain";

interface Fuente {
  nombre: string;
  datos: string;
  url: string;
  endpoint?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function formatearTasa(rate: number): string {
  return rate.toLocaleString("es-VE", { maximumFractionDigits: 4 });
}

/** Historial de tasa BCV + botón "Actualizar" + atribución de la fuente. */
export function ModalBcv({ isOpen, onClose }: Props) {
  const [tasas, setTasas] = useState<TasaFila[]>([]);
  const [fuente, setFuente] = useState<Fuente | null>(null);
  const [cargando, setCargando] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/tasas");
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { tasas: TasaFila[]; fuente: Fuente };
      setTasas(body.tasas || []);
      setFuente(body.fuente || null);
      setCargado(true);
    } catch {
      if (!cargado) showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setCargando(false);
    }
  }, [cargado]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cargar al abrir el modal (patrón de configuracion/page)
    if (isOpen) void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recargar solo al abrir
  }, [isOpen]);

  const actualizar = async () => {
    setActualizando(true);
    try {
      const res = await fetch("/api/tasas/actualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forzar: true }),
      });
      const body = (await res.json().catch(() => null)) as {
        tasas?: TasaFila[];
        fuente?: Fuente;
        actualizado?: boolean;
        motivo?: string;
        error?: string;
      } | null;
      if (!res.ok || !body) throw new Error();
      if (body.tasas) setTasas(body.tasas);
      if (body.fuente) setFuente(body.fuente);
      if (body.actualizado) {
        showToast(messages.tasas.actualizada, "success");
      } else if (body.motivo === "error") {
        showToast(body.error || messages.tasas.errorActualizar, "error");
      } else {
        showToast(messages.tasas.sinCambios, "info");
      }
    } catch {
      showToast(messages.tasas.errorActualizar, "error");
    } finally {
      setActualizando(false);
    }
  };

  const vigente = tasas[0];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={messages.tasas.modalTitulo} className="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-xl border border-gym-border bg-gym-bg p-4 text-center">
          <p className="text-xs text-gym-muted mb-1">{messages.tasas.tasaVigente}</p>
          {vigente ? (
            <>
              <p className="text-2xl font-semibold text-gym-text">
                {messages.tasas.tasaVigenteFormato.replace("{tasa}", formatearTasa(vigente.rate_bs))}
              </p>
              <p className="text-xs text-gym-muted mt-1">{formatDateTime(vigente.effective_at)}</p>
            </>
          ) : (
            <p className="text-sm text-gym-muted">{messages.tasas.tasaSinRegistro}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gym-text">{messages.tasas.historial}</p>
            <button
              type="button"
              onClick={() => void actualizar()}
              disabled={actualizando || cargando}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gym-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actualizando ? "animate-spin" : ""}`} />
              {actualizando ? messages.tasas.actualizando : messages.tasas.actualizar}
            </button>
          </div>

          {cargando && !cargado ? (
            <p className="text-sm text-gym-muted py-4 text-center">{messages.common.cargar}</p>
          ) : vigente ? (
            <div className="overflow-hidden rounded-xl border border-gym-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gym-bg text-left text-xs text-gym-muted">
                    <th className="px-3 py-2 font-medium">{messages.tasas.columnaFecha}</th>
                    <th className="px-3 py-2 font-medium text-right">{messages.tasas.columnaMonto}</th>
                  </tr>
                </thead>
                <tbody>
                  {tasas.map((t) => (
                    <tr key={t.id} className="border-t border-gym-border/60">
                      <td className="px-3 py-2 text-gym-text">{formatDateTime(t.effective_at)}</td>
                      <td className="px-3 py-2 text-right text-gym-text font-medium">
                        {formatearTasa(t.rate_bs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-gym-muted">{messages.tasas.vacio}</p>
              <p className="text-xs text-gym-muted mt-1">{messages.tasas.sinTasaAyuda}</p>
            </div>
          )}
        </div>

        {fuente && (
          <div className="flex items-start gap-2 rounded-xl border border-gym-border/60 bg-gym-bg/50 p-3">
            <Banknote className="w-4 h-4 text-gym-secondary mt-0.5 shrink-0" />
            <div className="text-xs text-gym-muted">
              <span className="text-gym-text font-medium">{messages.tasas.fuente}: </span>
              <a
                href={fuente.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gym-primary hover:underline"
              >
                {fuente.nombre}
              </a>
              <span> · {messages.tasas.fuenteDatos.replace("{fuente}", fuente.datos)}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
