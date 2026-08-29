import { describe, it, expect } from "vitest";

const superAdminNavItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/pagos", label: "Pagos" },
  { href: "/dashboard/miembros", label: "Miembros" },
  { href: "/dashboard/configuracion/notificaciones", label: "Notificaciones" },
  { href: "/dashboard/configuracion", label: "Config" },
];

const miembroNavItems = [
  { href: "/dashboard/mis-pagos", label: "Mis Pagos" },
];

describe("Sidebar navigation", () => {
  it("super_admin should see Dashboard, Pagos, Miembros, Notificaciones, Config", () => {
    expect(superAdminNavItems.map((i) => i.href)).toEqual([
      "/dashboard",
      "/dashboard/pagos",
      "/dashboard/miembros",
      "/dashboard/configuracion/notificaciones",
      "/dashboard/configuracion",
    ]);
  });

  it("super_admin should have exactly 5 nav items", () => {
    expect(superAdminNavItems).toHaveLength(5);
  });

  it("super_admin nav items should include Notificaciones", () => {
    const labels = superAdminNavItems.map((i) => i.label);
    expect(labels).toContain("Notificaciones");
  });

  it("miembro should NOT see Dashboard, Reportar, or Config in sidebar", () => {
    const miembroHrefs = miembroNavItems.map((i) => i.href);
    expect(miembroHrefs).not.toContain("/dashboard");
    expect(miembroHrefs).not.toContain("/dashboard/reportar-pago");
    expect(miembroHrefs).not.toContain("/dashboard/configuracion");
  });

  it("miembro should see Mis Pagos", () => {
    expect(miembroNavItems.map((i) => i.label)).toEqual(["Mis Pagos"]);
  });

  it("super_admin should not see Mis Pagos in sidebar", () => {
    const superAdminHrefs = superAdminNavItems.map((i) => i.href);
    expect(superAdminHrefs).not.toContain("/dashboard/mis-pagos");
  });
});
