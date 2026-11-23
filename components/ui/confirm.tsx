"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

export interface ConfirmarOpciones {
  titulo?: string;
  /** Texto del diálogo. Admite `\n` para varias líneas. */
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** `peligro` = acción destructiva (botón rojo). */
  tono?: "normal" | "peligro";
}

interface SolicitudConfirm {
  opciones: ConfirmarOpciones;
  resolver: (valor: boolean) => void;
}

type ConfirmListener = (solicitud: SolicitudConfirm) => void;

let confirmListener: ConfirmListener | null = null;

/**
 * Confirmación modal centrada y bloqueante (reemplaza `window.confirm`).
 * Devuelve `true` al confirmar y `false` al cancelar. Sin contenedor montado
 * resuelve `false` (nunca cuelga).
 */
export function confirmar(opciones: ConfirmarOpciones): Promise<boolean> {
  return new Promise((resolve) => {
    if (!confirmListener) {
      resolve(false);
      return;
    }
    confirmListener({ opciones, resolver: resolve });
  });
}

export function ConfirmContainer() {
  const [actual, setActual] = useState<SolicitudConfirm | null>(null);
  const actualRef = useRef<SolicitudConfirm | null>(null);
  const colaRef = useRef<SolicitudConfirm[]>([]);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmListener = (solicitud) => {
      if (actualRef.current) {
        colaRef.current.push(solicitud);
        return;
      }
      actualRef.current = solicitud;
      setActual(solicitud);
    };
    return () => {
      confirmListener = null;
    };
  }, []);

  const cerrar = (valor: boolean) => {
    const solicitud = actualRef.current;
    if (!solicitud) return;
    actualRef.current = null;
    solicitud.resolver(valor);
    const siguiente = colaRef.current.shift() ?? null;
    actualRef.current = siguiente;
    setActual(siguiente);
  };

  useEffect(() => {
    if (!actual) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cerrar(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        cerrar(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    const foco = setTimeout(() => confirmBtnRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "unset";
      clearTimeout(foco);
    };
  }, [actual]);

  if (!actual) return null;

  const { opciones } = actual;
  const peligro = opciones.tono === "peligro";

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={opciones.titulo ?? messages.common.confirmarAccion}
      onClick={(event) => {
        if (event.target === event.currentTarget) cerrar(false);
      }}
    >
      <div className="w-full max-w-md bg-gym-surface border border-gym-border rounded-2xl shadow-xl p-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <span
            className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${
              peligro ? "bg-gym-danger/15 text-gym-danger" : "bg-gym-primary/15 text-gym-primary"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gym-text">
              {opciones.titulo ?? messages.common.confirmarAccion}
            </p>
            <p className="text-sm text-gym-muted whitespace-pre-line mt-1 break-words">
              {opciones.mensaje}
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => cerrar(false)}
          >
            {opciones.textoCancelar ?? messages.common.cancelar}
          </Button>
          <Button
            ref={confirmBtnRef}
            type="button"
            variant={peligro ? "danger" : "primary"}
            className="flex-1"
            onClick={() => cerrar(true)}
          >
            {opciones.textoConfirmar ?? messages.common.confirmar}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
