"use client";

import { useEffect } from "react";

const CLAVE_SESION = "tasas_auto_actualizada";

/**
 * Actualización automática de la tasa BCV al entrar al dashboard (cualquier rol).
 * Fire-and-forget: no espera la respuesta ni muestra toasts, así el login y el
 * primer render del dashboard no se enteran. Un intento por sesión; la ruta
 * decide además si la vigencia está fresca (gate de 6 h) antes de tocar al
 * proveedor.
 */
export function AutoActualizarTasa() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (window.sessionStorage.getItem(CLAVE_SESION)) return;
      window.sessionStorage.setItem(CLAVE_SESION, "1");
    } catch {
      return; // almacenamiento no disponible: no se dispara (evita loops)
    }

    const disparar = () => {
      void fetch("/api/tasas/actualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forzar: false }),
        keepalive: true,
      }).catch(() => undefined);
    };

    type ConIdle = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    const w = window as ConIdle;
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(disparar, { timeout: 4000 });
    } else {
      window.setTimeout(disparar, 3000);
    }
  }, []);

  return null;
}
