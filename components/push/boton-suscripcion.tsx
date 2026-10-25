"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import {
  activarPush,
  desactivarPush,
  estadoPermiso,
  estaSuscrito,
  pushSoportado,
  sincronizarSuscripcion,
} from "@/lib/features/push/dispositivo";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";

type Estado = "cargando" | "activo" | "inactivo" | "bloqueado" | "sin-soporte";

const calcularEstado = async (): Promise<Estado> => {
  if (!pushSoportado()) return "sin-soporte";
  const permiso = estadoPermiso();
  if (permiso === "denied") return "bloqueado";
  if (permiso === "granted" && (await estaSuscrito())) return "activo";
  return "inactivo";
};

/**
 * Botón de suscripción push (admin y miembros; barra lateral / barra superior móvil).
 * Muestra el estado del permiso del navegador y alterna activar/desactivar.
 * Si el navegador no soporta push u ocurrió un error, no se rompe nada (fail-open).
 */
export function BotonSuscripcion({ variant = "fila" }: { variant?: "fila" | "icono" }) {
  const [estado, setEstado] = useState<Estado>("cargando");

  const refrescar = useCallback(() => {
    void calcularEstado().then(setEstado);
  }, []);

  // Estado "activo" LOCAL ⇒ asegura la fila del usuario de la sesión actual
  // en el servidor (permiso/suscripción son por origen, la fila es por usuario).
  useEffect(() => {
    if (estado !== "activo") return;
    let cancelado = false;
    void sincronizarSuscripcion().then((status) => {
      if (cancelado || status === null) return;
      if (status >= 200 && status < 300) return;
      showToast(
        status === 409 ? messages.push.deshabilitado : messages.push.errorGuardar,
        "warning"
      );
    });
    return () => {
      cancelado = true;
    };
  }, [estado]);

  useEffect(() => {
    void calcularEstado().then(setEstado);
    // la auto-suscripción (AutoSuscripcionMiembro) avisa al terminar
    window.addEventListener("push:estado", refrescar);
    // al volver de los ajustes de Chrome (permiso cambiado) refresca el estado
    const onVisibilidad = () => {
      if (!document.hidden) refrescar();
    };
    document.addEventListener("visibilitychange", onVisibilidad);
    return () => {
      window.removeEventListener("push:estado", refrescar);
      document.removeEventListener("visibilitychange", onVisibilidad);
    };
  }, [refrescar]);

  const handleClick = async () => {
    if (estado === "activo") {
      const ok = await desactivarPush();
      if (ok) {
        showToast(messages.push.desuscrito, "success");
        void refrescar();
      } else {
        showToast(messages.push.errorDesactivar, "error");
      }
      return;
    }
    const resultado = await activarPush();
    void refrescar();
    switch (resultado) {
      case "activado":
      case "ya-activo":
        showToast(messages.push.suscrito, "success");
        break;
      case "denegado":
        showToast(messages.push.bloqueado, "warning");
        break;
      case "deshabilitado":
        showToast(messages.push.deshabilitado, "warning");
        break;
      case "sin-clave":
        showToast(messages.push.sinConfigurar, "warning");
        break;
      case "sin-soporte":
        showToast(messages.push.sinSoporte, "warning");
        break;
      default:
        showToast(messages.push.errorActivar, "error");
    }
  };

  if (estado === "cargando" || estado === "sin-soporte") return null;

  if (variant === "icono") {
    if (estado === "bloqueado") {
      return (
        <button
          onClick={() => showToast(messages.push.bloqueadoAyuda, "warning")}
          title={messages.push.bloqueado}
          aria-label={messages.push.bloqueado}
          className="p-2 text-gym-muted/60 hover:text-gym-warning transition-colors"
        >
          <BellOff className="w-4 h-4" />
        </button>
      );
    }
    return (
      <button
        onClick={() => void handleClick()}
        aria-label={estado === "activo" ? messages.push.desactivar : messages.push.activar}
        title={estado === "activo" ? messages.push.activo : messages.push.activar}
        className="p-2 text-gym-muted hover:text-gym-text transition-colors"
      >
        {estado === "activo" ? (
          <BellRing className="w-4 h-4 text-gym-success" />
        ) : (
          <Bell className="w-4 h-4 text-gym-primary" />
        )}
      </button>
    );
  }

  if (estado === "bloqueado") {
    return (
      <button
        onClick={() => showToast(messages.push.bloqueadoAyuda, "warning")}
        title={messages.push.bloqueado}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-gym-muted/80 hover:text-gym-warning transition-colors text-left"
      >
        <BellOff className="w-4 h-4 shrink-0" />
        {messages.push.bloqueado}
      </button>
    );
  }

  return (
    <button
      onClick={() => void handleClick()}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-gym-bg/50 transition-colors text-left"
    >
      {estado === "activo" ? (
        <>
          <BellRing className="w-4 h-4 shrink-0 text-gym-success" />
          <span className="text-gym-success">{messages.push.activo}</span>
        </>
      ) : (
        <>
          <Bell className="w-4 h-4 shrink-0 text-gym-primary" />
          <span className="text-gym-primary">{messages.push.activar}</span>
        </>
      )}
    </button>
  );
}
