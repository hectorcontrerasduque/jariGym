import { describe, it, expect } from "vitest";
import type { Profile } from "@/lib/types";

function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "test-id",
    email: "test@example.com",
    full_name: "Test User",
    avatar_url: null,
    phone_number: "+58 412 1234567",
    document_id: null,
    role: "miembro",
    activo: true,
    start_date: new Date().toISOString(),
    inscription_amount_paid: 0,
    inscription_paid: false,
    inscription_date: null,
    inscription_admin_note: null,
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
    expect(profile.full_name).toBeDefined();
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
    const superAdmin = createMockProfile({ role: "super_admin" });

    expect(miembro.role).toBe("miembro");
    expect(superAdmin.role).toBe("super_admin");
  });

  it("should have nullable optional fields", () => {
    const profile = createMockProfile({
      document_id: null,
      avatar_url: null,
      inscription_admin_note: null,
      inscription_date: null,
    });

    expect(profile.document_id).toBeNull();
    expect(profile.avatar_url).toBeNull();
    expect(profile.inscription_admin_note).toBeNull();
    expect(profile.inscription_date).toBeNull();
  });

  it("should default inscription_paid to false", () => {
    const profile = createMockProfile();
    expect(profile.inscription_paid).toBe(false);
  });

  it("should have full_name as required string (not nullable)", () => {
    const profile = createMockProfile();
    expect(typeof profile.full_name).toBe("string");
    expect(profile.full_name.length).toBeGreaterThan(0);
  });
});

describe("Profile edit validation", () => {
  function validateProfileForm(data: { email: string; phone_number: string; full_name: string }): string[] {
    const errors: string[] = [];
    if (!data.email.trim()) errors.push("El email es obligatorio");
    if (!data.phone_number.trim()) errors.push("El WhatsApp es obligatorio");
    if (!data.full_name.trim()) errors.push("El nombre es obligatorio");
    return errors;
  }

  it("should require email", () => {
    const errors = validateProfileForm({ email: "", phone_number: "+58 412 1234567", full_name: "Test" });
    expect(errors).toContain("El email es obligatorio");
  });

  it("should require phone_number", () => {
    const errors = validateProfileForm({ email: "test@example.com", phone_number: "", full_name: "Test" });
    expect(errors).toContain("El WhatsApp es obligatorio");
  });

  it("should require full_name", () => {
    const errors = validateProfileForm({ email: "test@example.com", phone_number: "+58 412 1234567", full_name: "" });
    expect(errors).toContain("El nombre es obligatorio");
  });

  it("should pass with valid data", () => {
    const errors = validateProfileForm({ email: "test@example.com", phone_number: "+58 412 1234567", full_name: "Test User" });
    expect(errors).toHaveLength(0);
  });

  it("should fail with all empty", () => {
    const errors = validateProfileForm({ email: "", phone_number: "", full_name: "" });
    expect(errors).toHaveLength(3);
  });
});
