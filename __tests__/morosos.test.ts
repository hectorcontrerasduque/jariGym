import { describe, it, expect } from "vitest";

interface Moroso {
  id: string;
  email: string;
  nombre_completo: string;
  deudas: Array<{ mes: number; anio: number; monto: number }>;
  totalDeuda: number;
  debeInscripcion: boolean;
  mesesDeuda: number[];
}

function simulateGetMorosos(params: {
  miembros: Array<{ id: string; email: string; nombre_completo: string; inscripcion_pagada: boolean; activo: boolean | null; role: string; fecha_inscripcion?: string }>;
  pagos: Array<{ usuario_id: string; mes_pagar: number; anio_pagar: number; estado: string; notas?: string }>;
  libresIds: Set<string>;
  membresias?: Array<{ usuario_id: string; fecha_inicio?: string }>;
  ownerEmail: string;
  anioConsulta: number;
  mesActual: number;
  montoMensual: number;
  montoInscripcion: number;
}): Moroso[] {
  const { miembros, pagos, libresIds, membresias, ownerEmail, anioConsulta, mesActual, montoMensual, montoInscripcion } = params;

  const pagosAprobados = pagos.filter((p) => p.estado === "aprobado" || p.estado === "suspendido");

  const fechaInicioMap = new Map<string, string>();
  for (const m of membresias || []) {
    if (m.fecha_inicio) fechaInicioMap.set(m.usuario_id, m.fecha_inicio);
  }

  const miembrosConInscripcionPagada = new Set<string>();
  for (const pago of pagosAprobados) {
    const isInscripcion = pago.notas?.toLowerCase().includes("inscripción") || pago.notas?.toLowerCase().includes("inscripcion");
    if (isInscripcion) miembrosConInscripcionPagada.add(pago.usuario_id);
  }
  for (const m of miembros) {
    if (m.inscripcion_pagada) miembrosConInscripcionPagada.add(m.id);
  }

  const morosos: Moroso[] = [];

  for (const miembro of miembros) {
    if (miembro.activo === false) continue;
    if (libresIds.has(miembro.id)) continue;
    if (miembro.email?.toLowerCase() === ownerEmail) continue;

    const debeInscripcion = !miembrosConInscripcionPagada.has(miembro.id);

    const fechaInicioStr = fechaInicioMap.get(miembro.id) || miembro.fecha_inscripcion;
    let primerMesDeuda = 1;
    if (fechaInicioStr) {
      const parts = fechaInicioStr.split("-").map(Number);
      const anioInicio = parts[0];
      const mesInicio = parts[1];
      if (anioInicio > anioConsulta) continue;
      if (anioInicio === anioConsulta) {
        primerMesDeuda = mesInicio;
      }
    }

    const pagosMiembroQueCubren = pagosAprobados.filter((p) => p.usuario_id === miembro.id);
    const mesesCubiertos = new Set(pagosMiembroQueCubren.map((p) => p.mes_pagar));

    const mesesDeuda: number[] = [];
    for (let mes = primerMesDeuda; mes <= mesActual; mes++) {
      if (!mesesCubiertos.has(mes)) {
        mesesDeuda.push(mes);
      }
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
      nombre_completo: miembro.nombre_completo,
      deudas,
      totalDeuda,
      debeInscripcion,
      mesesDeuda,
    });
  }

  return morosos;
}

describe("Morosos detection logic", () => {
  const baseMiembro = { email: "test@test.com", activo: true as boolean | null, role: "miembro" as const, inscripcion_pagada: true };
  const ownerEmail = "owner@gym.com";

  it("member with no payments at all is moroso for all months up to current", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
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
      usuario_id: "m1",
      mes_pagar: mes,
      anio_pagar: 2026,
      estado: "aprobado" as const,
    }));

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
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
        usuario_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
      })),
      { usuario_id: "m1", mes_pagar: 8, anio_pagar: 2026, estado: "suspendido_pendiente" as const },
    ];

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
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
        usuario_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
      })),
      { usuario_id: "m1", mes_pagar: 8, anio_pagar: 2026, estado: "rechazado" as const },
    ];

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
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
        usuario_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
      })),
      { usuario_id: "m1", mes_pagar: 7, anio_pagar: 2026, estado: "suspendido" as const },
    ];

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
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
      usuario_id: "m1",
      mes_pagar: mes,
      anio_pagar: 2026,
      estado: (mes % 2 === 0 ? "aprobado" : "suspendido") as "aprobado" | "suspendido",
    }));

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
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
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
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
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Owner", email: ownerEmail }],
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
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Inactive", activo: false }],
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
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test", inscripcion_pagada: false }],
      pagos: [1, 2, 3, 4, 5, 6, 7, 8].map((mes) => ({
        usuario_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
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
        usuario_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
      })),
      { usuario_id: "m1", mes_pagar: 8, anio_pagar: 2026, estado: "pendiente" as const },
    ];

    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
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
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test", inscripcion_pagada: true }],
      pagos: [1, 2, 3].map((mes) => ({
        usuario_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
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
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test", inscripcion_pagada: false }],
      pagos: [
        { usuario_id: "m1", mes_pagar: 1, anio_pagar: 2026, estado: "aprobado", notas: "Inscripción - pago inicial" },
        ...[1, 2, 3].map((mes) => ({
          usuario_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
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
      usuario_id: "m1", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
    }));
    const pagosM2 = [1, 2, 3, 4, 5].map((mes) => ({
      usuario_id: "m2", mes_pagar: mes, anio_pagar: 2026, estado: "aprobado" as const,
    }));

    const result = simulateGetMorosos({
      miembros: [
        { ...baseMiembro, id: "m1", nombre_completo: "Member 1" },
        { ...baseMiembro, id: "m2", nombre_completo: "Member 2" },
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

  it("member who joined in March should only owe from March, not Jan-Feb", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
      pagos: [],
      libresIds: new Set(),
      membresias: [{ usuario_id: "m1", fecha_inicio: "2026-03-15" }],
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

  it("member with fecha_inscripcion in profile (no membresia) owes from that month", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test", fecha_inscripcion: "2026-06-01" }],
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

  it("membresia fecha_inicio takes precedence over profile fecha_inscripcion", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test", fecha_inscripcion: "2026-01-01" }],
      pagos: [],
      libresIds: new Set(),
      membresias: [{ usuario_id: "m1", fecha_inicio: "2026-05-01" }],
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
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
      pagos: [],
      libresIds: new Set(),
      membresias: [{ usuario_id: "m1", fecha_inicio: "2026-08-10" }],
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
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
      pagos: [],
      libresIds: new Set(),
      membresias: [{ usuario_id: "m1", fecha_inicio: "2027-01-15" }],
      ownerEmail,
      anioConsulta: 2026,
      mesActual: 12,
      montoMensual: 10,
      montoInscripcion: 5,
    });

    expect(result).toHaveLength(0);
  });

  it("member with no membresia and no fecha_inscripcion still owes from Jan (backwards compat)", () => {
    const result = simulateGetMorosos({
      miembros: [{ ...baseMiembro, id: "m1", nombre_completo: "Test" }],
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
