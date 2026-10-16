"use client";

import { useEffect } from "react";
import { useProfileContext } from "@/components/profile-context";
import { activarPush, estadoPermiso, pushSoportado } from "@/lib/features/push/dispositivo";

const CLAVE_INTENTO = "push_auto_intentado";

/**
 * Auto-suscripción de miembros: UN intento silencioso por dispositivo
 * (marcado en localStorage). Si el navegador muestra su aviso y el socio
 * acepta, queda suscrito; si lo bloquea, solo recibirá correo (fail-open).
 * Si `gym_config.push_enabled` está apagado no se marca el intento, así que
 * cuando el administrador lo encienda se intentará sola en la próxima visita.
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

      try {
        window.localStorage.setItem(CLAVE_INTENTO, "1");
      } catch {
        // almacenamiento no disponible: el permiso del navegador hace de dedup
      }

      const permiso = estadoPermiso();
      if (permiso === "default") {
        await activarPush();
      } else if (permiso === "granted") {
        await activarPush(); // renueva/sincroniza la suscripción con el servidor
      }
    };

    void ejecutar();
  }, [profile]);

  return null;
}
