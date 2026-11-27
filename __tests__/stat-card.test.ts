import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { StatBar, StatCard, StatRow } from "@/components/dashboard/stat-card";

describe("StatCard", () => {
  it("renderiza título, valor, sub-línea, badge y footer", () => {
    const html = renderToString(
      createElement(StatCard, {
        tone: "success",
        icon: createElement("span", null, "i"),
        badge: { label: "Activo" },
        title: "Miembros Activos",
        value: 12,
        subline: "8 inscritos · 4 pendientes",
        footer: createElement(StatBar, { percent: 66, tone: "success" }),
      })
    );

    expect(html).toContain("Miembros Activos");
    expect(html).toContain(">12<");
    expect(html).toContain("8 inscritos · 4 pendientes");
    expect(html).toContain("Activo");
    expect(html).toContain("66%");
  });

  it("renderiza las filas hijas", () => {
    const html = renderToString(
      createElement(
        StatCard,
        {
          tone: "danger",
          icon: null,
          badge: { label: "Deuda" },
          title: "Morosos",
          value: 3,
        },
        createElement(StatRow, { label: "Efectivo", value: "$10" })
      )
    );

    expect(html).toContain("Morosos");
    expect(html).toContain("Efectivo");
    expect(html).toContain("$10");
  });

  it("no aplica la clase interactiva sin onClick", () => {
    const html = renderToString(
      createElement(StatCard, {
        tone: "warning",
        icon: null,
        badge: { label: "Pendiente" },
        title: "Pagos Pendientes",
        value: 0,
      })
    );

    expect(html).not.toContain("stat-card-interactive");
  });
});

describe("StatBar", () => {
  it("limita el porcentaje a 100 y muestra la etiqueta", () => {
    const html = renderToString(createElement(StatBar, { percent: 150, tone: "secondary" }));

    expect(html).toContain("width:100%");
    expect(html).toContain("100%");
  });

  it("usa la etiqueta personalizada", () => {
    const html = renderToString(
      createElement(StatBar, { percent: 40, tone: "success", label: "40 %" })
    );

    expect(html).toContain("40 %");
  });
});

describe("StatRow", () => {
  it("muestra label, valor y hint", () => {
    const html = renderToString(
      createElement(StatRow, {
        label: "Bolívares",
        value: "$5",
        hint: "≈ 50 Bs",
      })
    );

    expect(html).toContain("Bolívares");
    expect(html).toContain("$5");
    expect(html).toContain("≈ 50 Bs");
  });
});
