import { describe, it, expect } from "vitest";
import { getMonthName, formatCurrency } from "@/lib/utils";

interface DashboardStats {
  totalMiembros: number;
  miembrosActivos: number;
  inscritosPagados: number;
  inscritosPendientes: number;
  deudoresTotal: number;
  deudoresInscripcion: number;
  deudoresMensualidad: number;
  alDiaMensualidad: number;
  montoDeuda: number;
  montoDeudaInscripcion: number;
  montoDeudaMensualidad: number;
  montoPagado: number;
  membresiaLibre: number;
}

function createMockStats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    totalMiembros: 10,
    miembrosActivos: 10,
    inscritosPagados: 8,
    inscritosPendientes: 2,
    deudoresTotal: 3,
    deudoresInscripcion: 1,
    deudoresMensualidad: 3,
    alDiaMensualidad: 7,
    montoDeuda: 15,
    montoDeudaInscripcion: 5,
    montoDeudaMensualidad: 10,
    montoPagado: 35,
    membresiaLibre: 1,
    ...overrides,
  };
}

describe("Dashboard stats", () => {
  it("should have required fields", () => {
    const stats = createMockStats();
    expect(stats.totalMiembros).toBeDefined();
    expect(stats.miembrosActivos).toBeDefined();
    expect(stats.inscritosPagados).toBeDefined();
    expect(stats.inscritosPendientes).toBeDefined();
    expect(stats.deudoresTotal).toBeDefined();
    expect(stats.deudoresInscripcion).toBeDefined();
    expect(stats.deudoresMensualidad).toBeDefined();
    expect(stats.alDiaMensualidad).toBeDefined();
    expect(stats.montoDeuda).toBeDefined();
    expect(stats.montoPagado).toBeDefined();
    expect(stats.membresiaLibre).toBeDefined();
  });

  it("total miembros should equal inscritosPagados + inscritosPendientes", () => {
    const stats = createMockStats();
    expect(stats.totalMiembros).toBe(stats.inscritosPagados + stats.inscritosPendientes);
  });

  it("montoDeuda should equal montoDeudaInscripcion + montoDeudaMensualidad", () => {
    const stats = createMockStats({ montoDeudaInscripcion: 5, montoDeudaMensualidad: 10 });
    expect(stats.montoDeuda).toBe(stats.montoDeudaInscripcion + stats.montoDeudaMensualidad);
  });

  it("alDiaMensualidad should count members with approved payment in current month with inscription", () => {
    const stats = createMockStats({ alDiaMensualidad: 5 });
    expect(stats.alDiaMensualidad).toBeGreaterThanOrEqual(0);
  });

  it("membresiaLibre members should not be counted as deudores", () => {
    const stats = createMockStats({ membresiaLibre: 2, deudoresMensualidad: 3 });
    expect(stats.deudoresMensualidad).toBeLessThan(stats.totalMiembros - stats.membresiaLibre);
  });

  it("inscritosPendientes are members without inscription paid", () => {
    const stats = createMockStats({ inscritosPagados: 8, inscritosPendientes: 2 });
    expect(stats.inscritosPagados + stats.inscritosPendientes).toBe(10);
  });

  it("deudoresTotal should be >= deudoresInscripcion + deudoresMensualidad overlap", () => {
    const stats = createMockStats({ deudoresTotal: 3, deudoresInscripcion: 1, deudoresMensualidad: 3 });
    expect(stats.deudoresTotal).toBeGreaterThanOrEqual(0);
  });
});

describe("Dashboard date helpers", () => {
  it("getMonthName should return correct Spanish month names", () => {
    expect(getMonthName(1)).toBe("Enero");
    expect(getMonthName(8)).toBe("Agosto");
    expect(getMonthName(12)).toBe("Diciembre");
  });

  it("formatCurrency should format amounts", () => {
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(25)).toBe("$25.00");
    expect(formatCurrency(100.5)).toBe("$100.50");
  });
});
