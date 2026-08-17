import { describe, it, expect } from "vitest";
import type { Profile } from "@/lib/types";

function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "test-id",
    email: "test@example.com",
    nombre_completo: "Test User",
    avatar_url: null,
    whatsapp: "+58 412 1234567",
    cedula: null,
    horario_entreno: null,
    role: "miembro",
    activo: true,
    fecha_inscripcion: new Date().toISOString(),
    monto_inscripcion_pagado: 0,
    inscripcion_pagada: false,
    inscripcion_fecha: null,
    notas_admin: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Profile type", () => {
  it("should have required fields", () => {
    const profile = createMockProfile();
    expect(profile.id).toBeDefined();
    expect(profile.email).toBeDefined();
    expect(profile.nombre_completo).toBeDefined();
    expect(profile.role).toBeDefined();
  });

  it("should not have estado, notas_estado, or membresia_libre", () => {
    const profile = createMockProfile();
    expect(profile).not.toHaveProperty("estado");
    expect(profile).not.toHaveProperty("notas_estado");
    expect(profile).not.toHaveProperty("membresia_libre");
  });

  it("should support all role types", () => {
    const miembro = createMockProfile({ role: "miembro" });
    const admin = createMockProfile({ role: "admin" });
    const superAdmin = createMockProfile({ role: "super_admin" });

    expect(miembro.role).toBe("miembro");
    expect(admin.role).toBe("admin");
    expect(superAdmin.role).toBe("super_admin");
  });

  it("should have nullable optional fields", () => {
    const profile = createMockProfile({
      cedula: null,
      horario_entreno: null,
      avatar_url: null,
      notas_admin: null,
      inscripcion_fecha: null,
    });

    expect(profile.cedula).toBeNull();
    expect(profile.horario_entreno).toBeNull();
    expect(profile.avatar_url).toBeNull();
    expect(profile.notas_admin).toBeNull();
    expect(profile.inscripcion_fecha).toBeNull();
  });

  it("should default inscripcion_pagada to false", () => {
    const profile = createMockProfile();
    expect(profile.inscripcion_pagada).toBe(false);
  });

  it("should have nombre_completo as required string (not nullable)", () => {
    const profile = createMockProfile();
    expect(typeof profile.nombre_completo).toBe("string");
    expect(profile.nombre_completo.length).toBeGreaterThan(0);
  });
});

describe("Profile edit validation", () => {
  function validateProfileForm(data: { email: string; whatsapp: string; nombre_completo: string }): string[] {
    const errors: string[] = [];
    if (!data.email.trim()) errors.push("El email es obligatorio");
    if (!data.whatsapp.trim()) errors.push("El WhatsApp es obligatorio");
    if (!data.nombre_completo.trim()) errors.push("El nombre es obligatorio");
    return errors;
  }

  it("should require email", () => {
    const errors = validateProfileForm({ email: "", whatsapp: "+58 412 1234567", nombre_completo: "Test" });
    expect(errors).toContain("El email es obligatorio");
  });

  it("should require whatsapp", () => {
    const errors = validateProfileForm({ email: "test@example.com", whatsapp: "", nombre_completo: "Test" });
    expect(errors).toContain("El WhatsApp es obligatorio");
  });

  it("should require nombre_completo", () => {
    const errors = validateProfileForm({ email: "test@example.com", whatsapp: "+58 412 1234567", nombre_completo: "" });
    expect(errors).toContain("El nombre es obligatorio");
  });

  it("should pass with valid data", () => {
    const errors = validateProfileForm({ email: "test@example.com", whatsapp: "+58 412 1234567", nombre_completo: "Test User" });
    expect(errors).toHaveLength(0);
  });

  it("should fail with all empty", () => {
    const errors = validateProfileForm({ email: "", whatsapp: "", nombre_completo: "" });
    expect(errors).toHaveLength(3);
  });
});
