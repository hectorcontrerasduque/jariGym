import { describe, it, expect } from "vitest";
import { derivarEventoPago } from "@/lib/features/pagos/domain/notify";
import { mensaje, messages } from "@/lib/messages";

describe("derivarEventoPago", () => {
  it("aprobado + super_admin → aprobado (push al miembro)", () => {
    expect(derivarEventoPago({ status: "aprobado", callerRole: "super_admin", esDueno: false })).toBe("aprobado");
  });

  it("aprobado + super_admin dueño → propio_aprobado (push a los demás super_admin)", () => {
    expect(derivarEventoPago({ status: "aprobado", callerRole: "super_admin", esDueno: true })).toBe("propio_aprobado");
  });

  it("rechazado + super_admin → rechazado (push al miembro)", () => {
    expect(derivarEventoPago({ status: "rechazado", callerRole: "super_admin", esDueno: false })).toBe("rechazado");
  });

  it("pendiente + super_admin de un tercero → registrado (push al miembro)", () => {
    expect(derivarEventoPago({ status: "pendiente", callerRole: "super_admin", esDueno: false })).toBe("registrado");
  });

  it("pendiente + super_admin dueño → sin_evento (no se notifica a nadie)", () => {
    expect(derivarEventoPago({ status: "pendiente", callerRole: "super_admin", esDueno: true })).toBe("sin_evento");
  });

  it("super_admin sobre un estado desconocido → estado_invalido", () => {
    expect(derivarEventoPago({ status: "suspendido", callerRole: "super_admin", esDueno: false })).toBe("estado_invalido");
  });

  it("pendiente + miembro dueño → reportado (push a los admins)", () => {
    expect(derivarEventoPago({ status: "pendiente", callerRole: "miembro", esDueno: true })).toBe("reportado");
  });

  it("pendiente + miembro ajeno → denegado (no puede notificar pagos de otros)", () => {
    expect(derivarEventoPago({ status: "pendiente", callerRole: "miembro", esDueno: false })).toBe("denegado");
  });

  it("aprobado + miembro dueño → denegado (los estados finales solo los notifica un admin)", () => {
    expect(derivarEventoPago({ status: "aprobado", callerRole: "miembro", esDueno: true })).toBe("denegado");
  });

  it("sin perfil → denegado", () => {
    expect(derivarEventoPago({ status: "pendiente", callerRole: null, esDueno: true })).toBe("denegado");
  });
});

describe("mensaje", () => {
  it("rellena los placeholders provistos", () => {
    expect(mensaje("Hola {nombre}, pagó {monto}", { nombre: "Ana", monto: "$10" })).toBe("Hola Ana, pagó $10");
  });

  it("deja intactos los placeholders sin valor", () => {
    expect(mensaje("Pago: {motivo}", {})).toBe("Pago: {motivo}");
  });

  it("los templates de eventos de pago son strings con placeholders", () => {
    expect(messages.eventosPago.reportadoCuerpo).toContain("{nombre}");
    expect(messages.eventosPago.rechazadoCuerpo).toContain("{motivo}");
    expect(messages.eventosPago.propioAprobadoCuerpo).toContain("{nombre}");
    expect(messages.eventosPago.propioAprobadoCuerpo).toContain("{monto}");
  });
});
