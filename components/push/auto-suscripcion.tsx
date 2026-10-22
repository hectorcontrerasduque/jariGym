"use client";

import { useEffect } from "react";
import { useProfileContext } from "@/components/profile-context";
import {
  activarPush,
  debeMarcarIntento,
  estadoPermiso,
  pushSoportado,
} from "@/lib/features/push/dispositivo";

const CLAVE_INTENTO = "push_auto_intentado";

/**
 * Auto-suscripción de miembros: UN intento por dispositivo (marcado en
 * localStorage) para no repetir el aviso del navegador.
 *
 * El intento solo se marca cuando el resultado es **terminal**: quedó suscrito
 * o el permiso quedó bloqueado. Si el socio solo cierra el aviso (el permiso
 * sigue "default") o falla la sincronización con el servidor, NO se marca y se
 * reintenta en la próxima visita; si bloquea el permiso, puede darlo de alta
 * después con la campana del menú. Si `gym_config.push_enabled` está apagado
 * no se marca nada, así que al encenderlo se intentará sola en la próxima visita.
 *
 * Al terminar dispara `push:estado` para que la campana (BotonSuscripcion)
 * refresque su estado sin recargar.
 */
export function AutoSuscripcionMiembro() {
  const { profile } = useProfileContext();

  useEffect(() => {
    if (!profile || profile.role === "super_admin") return;

    const ejecutar = async () => {
      if (typeof window === "undefined" || !pushSoportado()) return;
      try {
        if (window.localStorage.getItem(CLAVE_INTENTO)) return;
      } catch {
        return; // almacenamiento no disponible (modo privado)
      }

      try {
        const res = await fetch("/api/config/public");
        const { config } = await res.json();
        if (!config?.push_enabled) return;
      } catch {
        return; // sin gate confirmado no se intenta (y no se marca el intento)
      }

      const resultado = await activarPush();
      if (debeMarcarIntento(resultado, estadoPermiso())) {
        try {
          window.localStorage.setItem(CLAVE_INTENTO, "1");
        } catch {
          // almacenamiento no disponible: el permiso del navegador hace de dedup
        }
      }
      // la campana (BotonSuscripcion) refresca su estado sin recargar
      window.dispatchEvent(new Event("push:estado"));
    };

    void ejecutar();
  }, [profile]);

  return null;
}
