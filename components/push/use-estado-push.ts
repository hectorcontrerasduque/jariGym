"use client";

import { useCallback, useEffect, useState } from "react";
import { calcularEstadoPush, type EstadoPush } from "@/lib/features/push/dispositivo";

/**
 * Estado del push en este dispositivo + refresco automático:
 * - al montar,
 * - cuando otros componentes disparan `push:estado` (auto-suscripción, modal),
 * - al volver de los ajustes del navegador (visibilitychange).
 * Lo comparten la campana (BotonSuscripcion) y el modal de pagos.
 */
export function useEstadoPush(): { estado: EstadoPush; refrescar: () => void } {
  const [estado, setEstado] = useState<EstadoPush>("cargando");

  const refrescar = useCallback(() => {
    void calcularEstadoPush().then(setEstado);
  }, []);

  useEffect(() => {
    refrescar();
    window.addEventListener("push:estado", refrescar);
    const onVisibilidad = () => {
      if (!document.hidden) refrescar();
    };
    document.addEventListener("visibilitychange", onVisibilidad);
    return () => {
      window.removeEventListener("push:estado", refrescar);
      document.removeEventListener("visibilitychange", onVisibilidad);
    };
  }, [refrescar]);

  return { estado, refrescar };
}
