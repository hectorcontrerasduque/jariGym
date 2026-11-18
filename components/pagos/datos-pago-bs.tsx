"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Landmark, Smartphone } from "lucide-react";
import { messages } from "@/lib/messages";
import { datosPagoBs, type CampoDatoPago, type FilaDatoPago } from "@/lib/features/pagos/domain/banco";
import type { BsBankInfo } from "@/lib/types";

const TEXTOS = messages.bolivares.datosPago;

function etiquetaCampo(campo: CampoDatoPago): string {
  switch (campo) {
    case "banco":
      return TEXTOS.banco;
    case "cedula":
      return TEXTOS.cedula;
    case "telefono":
      return TEXTOS.telefono;
    case "tipo_cuenta":
      return TEXTOS.tipoCuenta;
    case "numero_transferencia":
      return TEXTOS.numeroCuenta;
    case "titular":
      return TEXTOS.titular;
    default:
      return campo;
  }
}

function valorCampo(campo: CampoDatoPago, valor: string): string {
  if (campo === "tipo_cuenta") {
    if (valor === "ahorro") return TEXTOS.ahorro;
    if (valor === "corriente") return TEXTOS.corriente;
  }
  return valor;
}

/**
 * Instrucciones de pago en Bs (pago móvil y/o transferencia) con botón para
 * copiar cada dato. No renderiza nada si la configuración está incompleta.
 */
export function DatosPagoBs({ info }: { info: BsBankInfo | null | undefined }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const secciones = datosPagoBs(info);
  if (secciones.pagoMovil.length === 0 && secciones.transferencia.length === 0) {
    return null;
  }

  const copiar = async (clave: string, valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      return;
    }
    setCopiado(clave);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiado(null), 1500);
  };

  const renderFila = (seccion: string, fila: FilaDatoPago) => {
    const clave = `${seccion}-${fila.campo}`;
    const esCopiado = copiado === clave;
    return (
      <div key={clave} className="flex items-center justify-between gap-2">
        <span className="text-xs text-gym-muted">{etiquetaCampo(fila.campo)}</span>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm text-gym-text font-mono truncate">{valorCampo(fila.campo, fila.valor)}</span>
          <button
            type="button"
            onClick={() => void copiar(clave, fila.valor)}
            title={esCopiado ? TEXTOS.copiado : TEXTOS.copiar}
            aria-label={`${esCopiado ? TEXTOS.copiado : TEXTOS.copiar}: ${etiquetaCampo(fila.campo)}`}
            className={`p-1 rounded-md transition-colors ${
              esCopiado ? "text-gym-success" : "text-gym-muted hover:text-gym-primary"
            }`}
          >
            {esCopiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gym-text">{TEXTOS.titulo}</p>
      {secciones.pagoMovil.length > 0 && (
        <div className="p-3 bg-gym-surface rounded-xl border border-gym-border space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gym-primary uppercase tracking-wide">
            <Smartphone className="w-3.5 h-3.5" /> {TEXTOS.pagoMovil}
          </p>
          {secciones.pagoMovil.map((fila) => renderFila("pago-movil", fila))}
        </div>
      )}
      {secciones.transferencia.length > 0 && (
        <div className="p-3 bg-gym-surface rounded-xl border border-gym-border space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gym-primary uppercase tracking-wide">
            <Landmark className="w-3.5 h-3.5" /> {TEXTOS.transferencia}
          </p>
          {secciones.transferencia.map((fila) => renderFila("transferencia", fila))}
        </div>
      )}
    </div>
  );
}
