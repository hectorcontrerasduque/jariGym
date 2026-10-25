"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { activarPush } from "@/lib/features/push/dispositivo";

interface ModalActivarPushProps {
  isOpen: boolean;
  /** Escape / X / overlay: cierra el modal sin enviar el pago (vuelve al formulario). */
  onCerrar: () => void;
  /** Botón "Continuar sin notificaciones": cierra y envía el pago retenido. */
  onContinuar: () => void;
}

/**
 * Interstitial al reportar un pago con el permiso de push SIN DECIDIR:
 * ofrece activar el navegador (el clic es el gesto válido que exige el navegador)
 * o continuar igual — el pago NUNCA queda bloqueado por las notificaciones.
 * Tras cualquier elección se despacha `push:estado` para refrescar la campana.
 */
export function ModalActivarPush({ isOpen, onCerrar, onContinuar }: ModalActivarPushProps) {
  const [trabajando, setTrabajando] = useState(false);

  const activar = async () => {
    setTrabajando(true);
    const resultado = await activarPush();
    setTrabajando(false);
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
    window.dispatchEvent(new Event("push:estado"));
    onContinuar();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCerrar}
      title={messages.push.modalTitulo}
      className="max-w-md"
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="p-2.5 rounded-xl bg-gym-primary/15 text-gym-primary shrink-0">
            <BellRing className="w-6 h-6" />
          </span>
          <p className="text-sm text-gym-muted leading-relaxed">{messages.push.modalCuerpo}</p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <Button variant="secondary" onClick={onContinuar} disabled={trabajando}>
            {messages.push.modalContinuar}
          </Button>
          <Button onClick={() => void activar()} loading={trabajando}>
            {messages.push.modalActivar}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
