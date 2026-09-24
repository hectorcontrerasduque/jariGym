/**
 * Regression: particles use Math.random, so the server render must not include them
 * (it caused a React hydration error on /login).
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { FloatingParticles } from "@/components/ui/floating-particles";

const colors: [string, string, string] = ["red", "green", "blue"];

describe("FloatingParticles", () => {
  it("el render del servidor no incluye partículas (sin valores aleatorios en el HTML)", () => {
    const html = renderToString(createElement(FloatingParticles, { id: "test", count: 10, colors }));
    expect(html).toContain('class="particles-container"');
    expect(html).not.toContain('class="particle"');
  });

  it("dos renders del servidor producen exactamente el mismo HTML", () => {
    const a = renderToString(createElement(FloatingParticles, { id: "test", count: 10, colors }));
    const b = renderToString(createElement(FloatingParticles, { id: "test", count: 10, colors }));
    expect(a).toBe(b);
  });
});
