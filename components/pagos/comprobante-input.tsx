"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { messages } from "@/lib/messages";

interface ComprobanteInputProps {
  file: File | null;
  onSelect: (file: File | null) => void;
  /** Mientras se procesa (p. ej. OCR) muestra el estado sobre el preview. */
  procesando?: boolean;
  label: string;
  obligatorio?: boolean;
  textoVacio: string;
  id?: string;
}

function esImagen(file: File): boolean {
  return (file.type || "").startsWith("image/");
}

/**
 * Adjunto único de comprobante: sin archivo muestra la zona de upload; con
 * archivo muestra un preview pequeño (ampliable) y solo permite adjuntar otro
 * después de eliminarlo.
 */
export function ComprobanteInput({
  file,
  onSelect,
  procesando = false,
  label,
  obligatorio = false,
  textoVacio,
  id = "comprobante",
}: ComprobanteInputProps) {
  const [ampliadaDe, setAmpliadaDe] = useState<File | null>(null);
  const esImagenSel = !!file && esImagen(file);

  const url = useMemo(() => {
    if (!file || !esImagenSel || typeof URL.createObjectURL !== "function") return null;
    try {
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }, [file, esImagenSel]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const ampliada = ampliadaDe === file && !!url;

  if (!file) {
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-gym-muted mb-2">
          {label}
          {obligatorio && <span className="text-gym-danger"> *</span>}
        </label>
        <label
          htmlFor={id}
          className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gym-border rounded-xl cursor-pointer hover:border-gym-primary transition-colors"
        >
          <Upload className="w-6 h-6 text-gym-muted mb-1" />
          <span className="text-xs text-gym-muted">{textoVacio}</span>
          <input
            id={id}
            name={id}
            type="file"
            className="hidden"
            accept="image/*,.pdf"
            onChange={(e) => {
              const seleccionado = e.target.files?.[0] || null;
              e.target.value = "";
              if (seleccionado) onSelect(seleccionado);
            }}
          />
        </label>
      </div>
    );
  }

  return (
    <div>
      <p className="block text-sm font-medium text-gym-muted mb-2">
        {label}
        {obligatorio && <span className="text-gym-danger"> *</span>}
      </p>
      <div className="flex items-center gap-3 p-2 bg-gym-bg border border-gym-border rounded-xl">
        <button
          type="button"
          onClick={() => setAmpliadaDe(file)}
          disabled={!url}
          aria-label={messages.bolivares.ampliarComprobante}
          title={url ? messages.bolivares.ampliarComprobante : file.name}
          className="relative flex-shrink-0 rounded-lg overflow-hidden disabled:cursor-default"
        >
          {esImagenSel && url ? (
            // eslint-disable-next-line @next/next/no-img-element -- object URL local del archivo seleccionado
            <img src={url} alt={messages.bolivares.verImagen} className="w-16 h-16 object-cover" />
          ) : (
            <span className="w-16 h-16 flex items-center justify-center bg-gym-surface text-gym-muted">
              <FileText className="w-6 h-6" />
            </span>
          )}
          {procesando && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gym-text truncate">{file.name}</p>
          {procesando && <p className="text-xs text-gym-primary">{messages.bolivares.procesandoImagen}</p>}
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label={messages.bolivares.eliminarComprobante}
          title={messages.bolivares.eliminarComprobante}
          className="flex-shrink-0 p-2 text-gym-muted hover:text-gym-danger transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {ampliada && url && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setAmpliadaDe(null)}
          role="dialog"
          aria-modal="true"
          aria-label={messages.bolivares.verImagen}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
            onClick={() => setAmpliadaDe(null)}
            aria-label={messages.bolivares.cerrarImagen}
          >
            <X className="w-6 h-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- object URL local del archivo seleccionado */}
          <img
            src={url}
            alt={messages.bolivares.verImagen}
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
