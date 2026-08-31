import { describe, it, expect } from "vitest";

interface Moroso {
  id: string;
  email: string;
  full_name: string;
  deudas: Array<{ mes: number; anio: number; monto: number }>;
  totalDeuda: number;
  debeInscripcion: boolean;
  mesesDeuda: number[];
}

function getDiaCobroLocal(fechaInscripcion: string, mes: number, anio: number, modoCobro: string): number {
  if (modoCobro === "dia_uno") return 1;
  const dia = new Date(fechaInscripcion).getDate();
  const ultimoDiaMes = new Date(anio, mes, 0).getDate();
  return Math.min(dia, ultimoDiaMes);
}

function simulateGetMorosos(params: {
  miembros: Array<{ id: string; email: string; full_name: string; inscription_paid: boolean; activo: boolean | null; role: string; start_date?: string }>;
  pagos: Array<{ user_id: string; mes_pagar: number; anio_pagar: number; estado: string; payment_note?: string }>;
  libresIds: Set<string>;
  memberships?: Array<{ user_id: string; start_date?: string }>;
  ownerEmail: string;
  anioConsulta: number;
  mesActual: number;
  montoMensual: number;
  montoInscripcion: number;
  hoy?: Date;
  modoCobro?: "dia_uno" | "fecha_inscripcion";
}): Moroso[] {
  const {
    miembros, pagos, libresIds, memberships, ownerEmail,
    anioConsulta, mesActual, montoMensual, montoInscripcion,
    hoy = new Date(anioConsulta, mesActual - 1, 15),
    modoCobro = "dia_uno",
  } = params;

  const pagosAprobados = pagos.filter((p) => p.estado === "aprobado" || p.estado === "suspendido");

  const fechaInicioMap = new Map<string, string>();
  for (const m of memberships || []) {
    if (m.start_date) fechaInicioMap.set(m.user_id, m.start_date);
  }

  const miembrosConInscripcionPagada = new Set<string>();
  for (const pago of pagosAprobados) {
    const isInscripcion = pago.payment_note?.toLowerCase().includes("inscripción") || pago.payment_note?.toLowerCase().includes("inscripcion");
    if (isInscripcion) miembrosConInscripcionPagada.add(pago.user_id);
  }
  for (const m of miembros) {
    if (m.inscription_paid) miembrosConInscripcionPagada.add(m.id);
  }

  const morosos: Moroso[] = [];

  for (const miembro of miembros) {
    if (miembro.activo === false) continue;
    if (libresIds.has(miembro.id)) continue;
    if (miembro.email?.toLowerCase() === ownerEmail) continue;

    const debeInscripcion = !miembrosConInscripcionPagada.has(miembro.id);

    const fechaInicioMembresia = fechaInicioMap.get(miembro.id);
    const fechaInscripcion = miembro.start_date;

    let fechaInicioStr = fechaInicioMembresia || fechaInscripcion;
    if (fechaInicioMembresia) {
      const membershipStart = new Date(fechaInicioMembresia);
      if (membershipStart > hoy) {
        fechaInicioStr = fechaInscripcion;
        if (!fechaInicioStr) continue;
      }
    }

    let primerMesDeuda = 1;
    if (fechaInicioStr) {
      const parts = fechaInicioStr.split("-").map(Number);
      const anioInicio = parts[0];
      const mesInicio = parts[1];

      const anioDeuda = anioInicio;
      const mesDeuda = mesInicio;

      if (anioDeuda > anioConsulta) continue;
      if (anioDeuda === anioConsulta) {
        primerMesDeuda = mesDeuda;
      }
    }

    const pagosMiembroQueCubren = pagosAprobados.filter((p) => p.user_id === miembro.id);
    const mesesCubiertos = new Set(pagosMiembroQueCubren.map((p) => p.mes_pagar));

    const mesesDeuda: number[] = [];
    for (let mes = primerMesDeuda; mes <= mesActual; mes++) {
      if (mesesCubiertos.has(mes)) continue;

      const diaCobro = getDiaCobroLocal(fechaInicioStr || "2000-01-01", mes, anioConsulta, modoCobro);
      if (mes === mesActual && hoy.getDate() < diaCobro) continue;

      mesesDeuda.push(mes);
    }

    if (!debeInscripcion && mesesDeuda.length === 0) continue;

    const deudas = mesesDeuda.map((mes) => ({
      mes,
      anio: anioConsulta,
      monto: montoMensual,
    }));

    const totalDeuda = mesesDeuda.length * montoMensual + (debeInscripcion ? montoInscripcion : 0);

    morosos.push({
      id: miembro.id,
      email: miembro.email!,
      full_name: miembro.full_name,
      deudas,
      totalDeuda,
      debeInscripcion,
      mesesDeuda,
    });
  }

  return morosos;
}

describe("Morosos detection logic", () => {
  const baseMiembro = { email: "test@test.com", activo: true as boolean | null, role: "miembro" as const, inscription_paid: true };
  const ownerEmail = "owner@gym.com";

  it("member with no payments at all is moroso for all months up to current", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result[0].totalDeuda).toBe(80);
    expect(result[0].debeInscripcion).toBe(false);
  });

  it("member who paid Jan-Jul but not Aug is moroso only for Aug", () => {
    const pagos = [1, 2, 3, 4, 5, 6, 7].map((mes) => ({
      user_id: "m1",
      mes_pagar: mes,
      anio_pagar: 2026,
      estado: "aprobado" as const,
    }));

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos,
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8]);
    expect(result[0].totalDeuda).toBe(10);
  });

  it("member with Aug in suspendido_pendiente is moroso for Aug", () => {
    const pagos = [
      ...[1, 2, 3, 4, 5, 6, 7].map((mes) => ({
        user_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
      })),
      { user_id: "m1", mes_pagar: 8, anio_pagar: 2026, estado: "suspendido_pendiente" as const },
    ];

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos,
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8]);
  });

  it("member with Aug rejected is moroso for Aug", () => {
    const pagos = [
      ...[1, 2, 3, 4, 5, 6, 7].map((mes) => ({
        user_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
      })),
      { user_id: "m1", mes_pagar: 8, anio_pagar: 2026, estado: "rechazado" as const },
    ];

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos,
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8]);
  });

  it("member with suspendido for Jul but nothing for Aug is moroso only for Aug", () => {
    const pagos = [
      ...[1, 2, 3, 4, 5, 6].map((mes) => ({
        user_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
      })),
      { user_id: "m1", mes_pagar: 7, anio_pagar: 2026, estado: "suspendido" as const },
    ];

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos,
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8]);
    expect(result[0].totalDeuda).toBe(10);
  });

  it("member with all months aprobado or suspendido is NOT moroso", () => {
    const pagos = [1, 2, 3, 4, 5, 6, 7, 8].map((mes) => ({
      user_id: "m1",
      mes_pagar: mes,
      anio_pagar: 2026,
      estado: (mes % 2 === 0 ? "aprobado" : "suspendido") as "aprobado" | "suspendido",
    }));

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos,
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(0);
  });

  it("free membership member is NOT moroso even with no payments", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos: [],
      libresIds: new Set(["m1"]),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(0);
  });

  it("gym owner is NOT moroso", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Owner", email: ownerEmail }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(0);
  });

  it("inactive member (activo=false) is NOT moroso", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Inactive", activo: false }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(0);
  });

  it("member without inscription paid gets debeInscripcion=true", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", inscription_paid: false }],
      pagos: [1, 2, 3, 4, 5, 6, 7, 8].map((mes) => ({
        user_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
      })),
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(true);
    expect(result[0].mesesDeuda).toEqual([]);
    expect(result[0].totalDeuda).toBe(5);
  });

  it("member with pending payment for Aug is moroso for Aug", () => {
    const pagos = [
      ...[1, 2, 3, 4, 5, 6, 7].map((mes) => ({
        user_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
      })),
      { user_id: "m1", mes_pagar: 8, anio_pagar: 2026, estado: "pendiente" as const },
    ];

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos,
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8]);
  });

  it("member with inscription paid via profile flag is NOT moroso for inscription", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", inscription_paid: true }],
      pagos: [1, 2, 3].map((mes) => ({
        user_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
      })),
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(false);
  });

  it("member with inscription paid via pago nota is NOT moroso for inscription", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", inscription_paid: false }],
      pagos: [
        { user_id: "m1", mes_pagar: 1, anio_pagar: 2026, estado: "aprobado", payment_note: "Inscripción - pago inicial" },
        ...[1, 2, 3].map((mes) => ({
          user_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
        })),
      ],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(false);
  });

  it("multiple morosos are returned correctly", () => {
    const pagosM1 = [1, 2, 3, 4, 5, 6, 7].map((mes) => ({
      user_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
    }));
    const pagosM2 = [1, 2, 3, 4, 5].map((mes) => ({
      user_id: "m2", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
    }));

    const result = simulateGetMorosos({
      miembros: [
        { ...baseMiembro, id: "m1", full_name: "Member 1" },
        { ...baseMiembro, id: "m2", full_name: "Member 2" },
      ],
      pagos: [...pagosM1, ...pagosM2],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(2);
    const m1 = result.find((r) => r.id === "m1");
    const m2 = result.find((r) => r.id === "m2");
    expect(m1?.mesesDeuda).toEqual([8]);
    expect(m2?.mesesDeuda).toEqual([6, 7, 8]);
  });

  it("member who joined in March owes from March (no grace period)", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos: [],
      libresIds: new Set(),
      memberships: [{ user_id: "m1", start_date: "2026-03-15" }],
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([3, 4, 5, 6, 7, 8]);
    expect(result[0].totalDeuda).toBe(60);
  });

  it("member with start_date in profile (no membresia) owes from that month", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-06-01" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([6, 7, 8]);
    expect(result[0].totalDeuda).toBe(30);
  });

  it("membresia start_date takes precedence over profile start_date", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-01-01" }],
      pagos: [],
      libresIds: new Set(),
      memberships: [{ user_id: "m1", start_date: "2026-05-01" }],
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([5, 6, 7, 8]);
    expect(result[0].totalDeuda).toBe(40);
  });

  it("member who joined in current month only owes that month", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos: [],
      libresIds: new Set(),
      memberships: [{ user_id: "m1", start_date: "2026-08-10" }],
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8]);
    expect(result[0].totalDeuda).toBe(10);
  });

  it("member who joined next year is NOT moroso this year", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos: [],
      libresIds: new Set(),
      memberships: [{ user_id: "m1", start_date: "2027-01-15" }],
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 12,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(0);
  });

  it("member with no membresia and no start_date still owes from Jan", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3]);
  });
});

describe("Morosos - future membership handling", () => {
  const baseMiembro = { email: "test@test.com", activo: true as boolean | null, role: "miembro" as const, inscription_paid: true };
  const ownerEmail = "owner@gym.com";

  it("future membership with profile start_date uses profile date", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-08-26" }],
      pagos: [],
      libresIds: new Set(),
      memberships: [{ user_id: "m1", start_date: "2026-11-01" }],
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 9,
      montoMensual: 10,
      montoInscripcion: 5,
      hoy: new Date(2026, 8, 1),
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8, 9]);
  });

  it("future membership with no profile start_date is skipped", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test" }],
      pagos: [],
      libresIds: new Set(),
      memberships: [{ user_id: "m1", start_date: "2027-01-15" }],
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 12,
      montoMensual: 10,
      montoInscripcion: 5,
      hoy: new Date(2026, 11, 1),
    });

    expect(result).toHaveLength(0);
  });

  it("past membership is NOT treated as libre even if not in libresIds", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-01-01" }],
      pagos: [],
      libresIds: new Set(),
      memberships: [{ user_id: "m1", start_date: "2026-01-01" }],
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3]);
  });
});

describe("Morosos - diaCobro check on current month", () => {
  const baseMiembro = { email: "test@test.com", activo: true as boolean | null, role: "miembro" as const, inscription_paid: true };
  const ownerEmail = "owner@gym.com";

  it("dia_uno: member is NOT moroso if today < day 1 (impossible, but edge case)", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-01-01" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
      hoy: new Date(2026, 7, 1),
      modoCobro: "dia_uno",
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("fecha_inscripcion: member is NOT moroso for current month if today < diaCobro", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-01-28T12:00:00Z" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
      hoy: new Date(2026, 2, 27),
      modoCobro: "fecha_inscripcion",
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2]);
  });

  it("fecha_inscripcion: member IS moroso for current month if today >= diaCobro", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-01-28" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
      hoy: new Date(2026, 2, 28),
      modoCobro: "fecha_inscripcion",
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3]);
  });

  it("fecha_inscripcion: diaCobro clamped to 28 for February", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-01-31" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 2,
      montoMensual: 10,
      montoInscripcion: 5,
      hoy: new Date(2026, 1, 28),
      modoCobro: "fecha_inscripcion",
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2]);
  });

  it("fecha_inscripcion: diaCobro clamped to 29 for February in leap year", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2024-01-31" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2024,
      mesActual: 2,
      montoMensual: 10,
      montoInscripcion: 5,
      hoy: new Date(2024, 1, 29),
      modoCobro: "fecha_inscripcion",
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2]);
  });

  it("fecha_inscripcion: member not moroso on Feb 28 if diaCobro is 29 (leap year)", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2024-01-31" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2024,
      mesActual: 2,
      montoMensual: 10,
      montoInscripcion: 5,
      hoy: new Date(2024, 1, 28),
      modoCobro: "fecha_inscripcion",
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1]);
  });
});

describe("Morosos - inscription debt", () => {
  const baseMiembro = { email: "test@test.com", activo: true as boolean | null, role: "miembro" as const, inscription_paid: false };
  const ownerEmail = "owner@gym.com";

  it("member without inscription paid owes inscription + months", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-01-01" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 2,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(true);
    expect(result[0].mesesDeuda).toEqual([1, 2]);
    expect(result[0].totalDeuda).toBe(25);
  });

  it("member with inscription paid but no monthly payments owes only months", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", inscription_paid: true }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(false);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3]);
    expect(result[0].totalDeuda).toBe(30);
  });

  it("member with inscription paid via approved pago (inscripcion type) is NOT moroso for inscription", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", inscription_paid: false }],
      pagos: [
        { user_id: "m1", mes_pagar: 1, anio_pagar: 2026, estado: "aprobado", payment_note: "Inscripción - pago inicial" },
      ],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(false);
  });
});

describe("Morosos - edge cases with null/empty/invalid data", () => {
  const baseMiembro = { email: "test@test.com", activo: true as boolean | null, role: "miembro" as const, inscription_paid: true };
  const ownerEmail = "owner@gym.com";

  it("member with null email is NOT excluded (email check uses optional chaining)", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", email: null as unknown as string }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
  });

  it("member with empty string email is NOT moroso for owner check", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", email: "" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
  });

  it("member with activo=null is considered active (not excluded)", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", activo: null }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
  });

  it("member with empty string start_date falls back to Jan", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3]);
  });

  it("member with membership start_date as empty string falls back to profile", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-06-01" }],
      pagos: [],
      libresIds: new Set(),
      memberships: [{ user_id: "m1", start_date: "" }],
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([6, 7, 8]);
  });

  it("member with invalid date format (not YYYY-MM-DD) defaults to Jan", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "not-a-date" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3]);
  });

  it("member with membership start_date as invalid format falls back to profile", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-06-01" }],
      pagos: [],
      libresIds: new Set(),
      memberships: [{ user_id: "m1", start_date: "invalid" }],
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 8,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("member with whitespace-only email is NOT moroso for owner check", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", email: "  " }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
  });

  it("owner email case-insensitive check works", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Owner", email: "OWNER@GYM.COM" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail: "owner@gym.com",
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(0);
  });

  it("member with montoMensual=0 has zero totalDeuda for months", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", inscription_paid: false, start_date: "2026-01-01" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 0,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].totalDeuda).toBe(5);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3]);
  });

  it("member with montoInscripcion=0 has zero inscription debt but owes months", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", inscription_paid: false, start_date: "2026-01-01" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 1,
      montoMensual: 10,
      montoInscripcion: 0,
    });

    expect(result).toHaveLength(1);
    expect(result[0].debeInscripcion).toBe(true);
    expect(result[0].totalDeuda).toBe(10);
  });

  it("member with December start_date owes from Dec", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-12-15" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 12,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([12]);
    expect(result[0].totalDeuda).toBe(10);
  });

  it("member with far future year is NOT moroso", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2099-01-01" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 12,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(0);
  });

  it("member with past year start_date owes all months", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2020-06-01" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2, 3]);
  });

  it("multiple members with mixed statuses", () => {
    const result = simulateGetMorosos({
      miembros: [
        { ...baseMiembro, id: "m1", full_name: "Active", start_date: "2026-01-01" },
        { ...baseMiembro, id: "m2", full_name: "Inactive", activo: false, start_date: "2026-01-01" },
        { ...baseMiembro, id: "m3", full_name: "Owner", email: ownerEmail, start_date: "2026-01-01" },
        { ...baseMiembro, id: "m4", full_name: "Free", start_date: "2026-01-01" },
      ],
      pagos: [],
      libresIds: new Set(["m4"]),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 3,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
  });

  it("member with large montoInscripcion calculates total correctly", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", inscription_paid: false, start_date: "2026-01-01" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 2,
      montoMensual: 15,
      montoInscripcion: 100,
    });

    expect(result).toHaveLength(1);
    expect(result[0].totalDeuda).toBe(130);
  });
});

describe("Morosos - no grace period verification", () => {
  const baseMiembro = { email: "test@test.com", activo: true as boolean | null, role: "miembro" as const, inscription_paid: true };
  const ownerEmail = "owner@gym.com";

  it("member who entered Aug 16 owes from August (not September)", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-08-16" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 9,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([8, 9]);
    expect(result[0].totalDeuda).toBe(20);
  });

  it("member who entered Jan 1 owes from January (not February)", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-01-01" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 2,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([1, 2]);
  });

  it("member who entered Dec 31 owes only December", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", full_name: "Test", start_date: "2026-12-31" }],
      pagos: [],
      libresIds: new Set(),
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 12,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].mesesDeuda).toEqual([12]);
  });
});
