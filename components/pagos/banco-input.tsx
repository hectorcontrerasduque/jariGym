"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { messages } from "@/lib/messages";
import { buscarBancos, canonicalizarBanco } from "@/lib/features/pagos/domain/bancos";

interface BancoInputProps {
  id?: string;
  value: string;
  onChange: (banco: string) => void;
  placeholder?: string;
}

/**
 * Combobox de bancos: filtra el catálogo canónico mientras se escribe y solo
 * permite seleccionar una opción de la lista (al perder foco normaliza alias
 * como "bdv" → "Banco de Venezuela"). Evita guardar variantes inventadas.
 */
export function BancoInput({ id = "bank-bs", value, onChange, placeholder }: BancoInputProps) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const opciones = useMemo(() => buscarBancos(value), [value]);
  const esCanonico = canonicalizarBanco(value) !== null;

  useEffect(() => {
    if (!abierto) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (!contenedorRef.current?.contains(event.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [abierto]);

  const seleccionar = (banco: string) => {
    onChange(banco);
    setAbierto(false);
  };

  return (
    <div ref={contenedorRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-muted pointer-events-none" />
        <input
          id={id}
          name="bank"
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => {
            const canonico = canonicalizarBanco(value);
            if (canonico) onChange(canonico);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setAbierto(false);
            } else if (e.key === "Enter" && abierto) {
              e.preventDefault();
              if (opciones.length > 0) seleccionar(opciones[0]);
            }
          }}
          className="w-full pl-9 pr-9 py-2.5 bg-gym-surface border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-opciones`}
        />
        {esCanonico ? (
          <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-success pointer-events-none" />
        ) : (
          <ChevronDown
            className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gym-muted pointer-events-none transition-transform ${abierto ? "rotate-180" : ""}`}
          />
        )}
      </div>

      {abierto && (
        <ul
          id={`${id}-opciones`}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto bg-gym-surface border border-gym-border rounded-xl shadow-lg"
        >
          {opciones.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gym-muted">{messages.bolivares.sinResultados}</li>
          ) : (
            opciones.map((banco) => (
              <li key={banco} role="option" aria-selected={banco === value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => seleccionar(banco)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    banco === value
                      ? "bg-gym-primary/15 text-gym-primary font-medium"
                      : "text-gym-text hover:bg-gym-primary/10"
                  }`}
                >
                  {banco}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
