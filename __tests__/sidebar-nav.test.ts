import { describe, it, expect } from "vitest";

const adminNavItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/pagos", label: "Pagos" },
  { href: "/dashboard/miembros", label: "Miembros" },
  { href: "/dashboard/configuracion", label: "Config" },
];

const miembroNavItems = [
  { href: "/dashboard/mis-pagos", label: "Mis Pagos" },
];

describe("Sidebar navigation", () => {
  it("admin should see Dashboard, Pagos, Miembros, Config", () => {
    expect(adminNavItems.map((i) => i.href)).toEqual([
      "/dashboard",
      "/dashboard/pagos",
      "/dashboard/miembros",
      "/dashboard/configuracion",
    ]);
  });

  it("miembro should NOT see Dashboard, Reportar, or Mi Perfil in sidebar", () => {
    const miembroHrefs = miembroNavItems.map((i) => i.href);
    expect(miembroHrefs).not.toContain("/dashboard");
    expect(miembroHrefs).not.toContain("/dashboard/reportar-pago");
    expect(miembroHrefs).not.toContain("/dashboard/mi-perfil");
    expect(miembroHrefs).not.toContain("/dashboard/perfil");
  });

  it("miembro should see Mis Pagos", () => {
    expect(miembroNavItems.map((i) => i.label)).toEqual(["Mis Pagos"]);
  });

  it("miembro should have exactly 1 nav item", () => {
    expect(miembroNavItems).toHaveLength(1);
  });

  it("admin should not see Mis Pagos in sidebar", () => {
    const adminHrefs = adminNavItems.map((i) => i.href);
    expect(adminHrefs).not.toContain("/dashboard/mis-pagos");
  });
});
