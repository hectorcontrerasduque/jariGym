import { describe, it, expect } from "vitest";
import { debeMarcarIntento } from "@/lib/features/push/dispositivo";

describe("debeMarcarIntento (auto-suscripción de miembros)", () => {
  it("marca cuando quedó suscrito y sincronizado", () => {
    expect(debeMarcarIntento("activado", "granted")).toBe(true);
    expect(debeMarcarIntento("ya-activo", "granted")).toBe(true);
  });

  it("marca cuando el permiso quedó bloqueado (terminal: no volver a molestar)", () => {
    expect(debeMarcarIntento("denegado", "denied")).toBe(true);
  });

  it("NO marca si el socio solo cerró el aviso (permiso sigue default)", () => {
    expect(debeMarcarIntento("denegado", "default")).toBe(false);
    expect(debeMarcarIntento("error", "default")).toBe(false);
  });

  it("NO marca si falló la sincronización con permiso concedido (reintenta)", () => {
    expect(debeMarcarIntento("error", "granted")).toBe(false);
  });

  it("NO marca si falta la clave VAPID (reintenta cuando se configure)", () => {
    expect(debeMarcarIntento("sin-clave", "granted")).toBe(false);
    expect(debeMarcarIntento("sin-clave", "default")).toBe(false);
  });

  it("NO marca si el canal está deshabilitado en el servidor (reintenta)", () => {
    expect(debeMarcarIntento("deshabilitado", "granted")).toBe(false);
  });
});
