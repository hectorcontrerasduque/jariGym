import { describe, it, expect } from "vitest";
import { adminNavItems, miembroNavItems } from "@/lib/nav-items";

describe("Sidebar navigation — real nav items", () => {
  it("admin has exactly 5 items: Dashboard, Pagos, Miembros, Notificaciones, Config", () => {
    expect(adminNavItems).toHaveLength(5);
    expect(adminNavItems.map((i) => i.href)).toEqual([
      "/dashboard",
      "/dashboard/pagos",
      "/dashboard/miembros",
      "/dashboard/configuracion/notificaciones",
      "/dashboard/configuracion",
    ]);
  });

  it("admin items include Notificaciones", () => {
    const labels = adminNavItems.map((i) => i.label);
    expect(labels).toContain("Notificaciones");
  });

  it("miembro has exactly 2 items: Home, Mis Pagos", () => {
    expect(miembroNavItems).toHaveLength(2);
    expect(miembroNavItems.map((i) => i.label)).toEqual(["Home", "Mis Pagos"]);
  });

  it("miembro does NOT see Dashboard, Reportar Pago, or Config", () => {
    const miembroHrefs = miembroNavItems.map((i) => i.href);
    expect(miembroHrefs).not.toContain("/dashboard");
    expect(miembroHrefs).not.toContain("/dashboard/reportar-pago");
    expect(miembroHrefs).not.toContain("/dashboard/configuracion");
  });

  it("admin does NOT see Mis Pagos", () => {
    const adminHrefs = adminNavItems.map((i) => i.href);
    expect(adminHrefs).not.toContain("/dashboard/mis-pagos");
  });

  it("all admin items have an icon component", () => {
    for (const item of adminNavItems) {
      expect(item.icon).toBeDefined();
    }
  });

  it("all miembro items have an icon component", () => {
    for (const item of miembroNavItems) {
      expect(item.icon).toBeDefined();
    }
  });
});
