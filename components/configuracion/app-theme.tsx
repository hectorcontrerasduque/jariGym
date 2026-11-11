"use client";

import { useEffect } from "react";

/** Valores hardcodeados actuales del tema (app/globals.css @theme). */
export const TEMA_DEFAULT = {
  color_primario: "#38BDF8",
  color_secundario: "#818CF8",
  color_fondo: "#0B1120",
  color_fuente: "#F8FAFC",
  color_superficie: "#111827",
  color_borde: "#1E293B",
  font_family: "" as string,
} as const;

export type TemaConfig = {
  color_primario?: string | null;
  color_secundario?: string | null;
  color_fondo?: string | null;
  color_fuente?: string | null;
  color_superficie?: string | null;
  color_borde?: string | null;
  font_family?: string | null;
};

/**
 * Aplica el tema de gym_config sobre las variables CSS del :root.
 * Valores null/vacíos → se quita la variable y prevalece el CSS hardcodeado.
 */
export function aplicarTema(config: TemaConfig | null | undefined) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const set = (name: string, value?: string | null) => {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  };
  set("--color-gym-primary", config?.color_primario);
  set("--color-gym-secondary", config?.color_secundario);
  set("--color-gym-bg", config?.color_fondo);
  set("--color-gym-text", config?.color_fuente);
  set("--color-gym-surface", config?.color_superficie);
  set("--color-gym-border", config?.color_borde);
  set("--font-gym-family", config?.font_family);
}

/**
 * Montado en el layout raíz: carga /api/config/public una vez y aplica el tema.
 * Re-aplica en cada evento `config:updated` (guardado desde Config).
 * Fail-open: si falla la carga, prevalece el CSS hardcodeado.
 */
export default function AppTheme() {
  useEffect(() => {
    const aplicar = async () => {
      try {
        const res = await fetch("/api/config/public");
        if (!res.ok) return;
        const body = (await res.json()) as { config: TemaConfig | null };
        aplicarTema(body.config);
      } catch {
        // sin red o error → CSS hardcodeado
      }
    };
    void aplicar();
    window.addEventListener("config:updated", aplicar);
    return () => window.removeEventListener("config:updated", aplicar);
  }, []);

  return null;
}
