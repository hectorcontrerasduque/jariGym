import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ConfirmContainer, confirmar } from "@/components/ui/confirm";

describe("confirmar (diálogo imperativo)", () => {
  it("sin contenedor montado resuelve false (no cuelga)", async () => {
    await expect(confirmar({ mensaje: "¿Continuar?" })).resolves.toBe(false);
  });

  it("el contenedor cerrado no renderiza nada", () => {
    expect(renderToString(createElement(ConfirmContainer))).toBe("");
  });
});
