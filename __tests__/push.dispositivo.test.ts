import { describe, it, expect } from "vitest";
import { debeMarcarIntento, debePedirActivacion } from "@/lib/features/push/dispositivo";

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

describe("debePedirActivacion (modal al reportar un pago)", () => {
  it("pide el modal SOLO cuando el permiso sigue sin decidir", () => {
    expect(debePedirActivacion("inactivo")).toBe(true);
  });

  it("no pide si las notificaciones ya están activas", () => {
    expect(debePedirActivacion("activo")).toBe(false);
  });

  it("no pide si el permiso está bloqueado o no hay soporte (el pago nunca se bloquea)", () => {
    expect(debePedirActivacion("bloqueado")).toBe(false);
    expect(debePedirActivacion("sin-soporte")).toBe(false);
  });

  it("no pide mientras se calcula el estado", () => {
    expect(debePedirActivacion("cargando")).toBe(false);
  });
});
