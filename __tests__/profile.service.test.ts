/**
 * createOrUpdateUser: validation and partial updates.
 * Bug: changing a member's role from the Miembros page (PUT /api/profile with only
 * { role, inscription_admin_note }) failed with "Email inválido" because every call
 * required email and full_name, even updates of an existing profile by id.
 */
import { describe, it, expect } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";
import { createOrUpdateUser } from "@/lib/services/miembros/profile.service";

const existente = {
  id: "u1",
  email: "socio@gym.local",
  full_name: "DIEGO RAMÍREZ",
  role: "miembro",
  inscription_admin_note: null,
};

/** Existing profile found by id, then the update returns the merged row. */
function prepararActualizacion(fake: SupabaseFake) {
  fake.on("profiles", "select").reply({ data: existente });
  fake.on("profiles", "update").reply({ data: { ...existente, role: "super_admin" } });
}

describe("createOrUpdateUser — validación (comportamiento que se conserva)", () => {
  it("crear sin email → email_invalid", async () => {
    const fake = createSupabaseFake();
    await expect(createOrUpdateUser(fake.client, { email: undefined as unknown as string, full_name: "Ana" })).rejects.toThrow("email_invalid");
    expect(fake.calls).toHaveLength(0);
  });

  it("crear con nombre vacío → name_required", async () => {
    const fake = createSupabaseFake();
    await expect(createOrUpdateUser(fake.client, { email: "ana@gym.local", full_name: "  " })).rejects.toThrow("name_required");
  });

  it("actualizar con un email inválido explícito → email_invalid", async () => {
    const fake = createSupabaseFake();
    await expect(createOrUpdateUser(fake.client, { id: "u1", email: "no-es-email", full_name: "Ana" })).rejects.toThrow("email_invalid");
  });

  it("actualizar con un nombre de más de 200 caracteres → name_too_long", async () => {
    const fake = createSupabaseFake();
    await expect(createOrUpdateUser(fake.client, { id: "u1", email: "socio@gym.local", full_name: "A".repeat(201) })).rejects.toThrow("name_too_long");
  });

  it("actualización completa (pantalla Perfil): guarda nombre en mayúsculas, email y demás campos", async () => {
    const fake = createSupabaseFake();
    prepararActualizacion(fake);
    await createOrUpdateUser(fake.client, {
      id: "u1",
      email: "socio@gym.local",
      full_name: "diego ramírez ",
      phone_number: "+584141234567",
      arrival_time: "07:00",
      isSuperAdmin: true,
    });
    expect(fake.callsTo("profiles", "update")[0].payload).toEqual({
      full_name: "DIEGO RAMÍREZ",
      email: "socio@gym.local",
      phone_number: "+584141234567",
      arrival_time: "07:00",
    });
  });
});

describe("createOrUpdateUser — actualización parcial por id (bug del cambio de rol)", () => {
  it("solo rol + nota (lo que envía Miembros) actualiza solo esos campos", async () => {
    const fake = createSupabaseFake();
    prepararActualizacion(fake);
    const r = await createOrUpdateUser(fake.client, {
      id: "u1",
      email: undefined as unknown as string, // /api/profile passes updates.email || undefined
      full_name: "", // /api/profile passes updates.full_name || ""
      role: "super_admin",
      inscription_admin_note: "* 24/9/2026 Dueño - Super Admin activado",
      isSuperAdmin: true,
    });
    expect(fake.callsTo("profiles", "update")[0].payload).toEqual({
      role: "super_admin",
      inscription_admin_note: "* 24/9/2026 Dueño - Super Admin activado",
    });
    expect(fake.callsTo("profiles", "update")[0].filters).toContainEqual(["eq", "id", "u1"]);
    expect(r.user).toMatchObject({ id: "u1", role: "super_admin" });
    // No email/Auth changes
    expect(fake.calls.filter((c) => c.kind === "auth")).toHaveLength(0);
  });

  it("cambio de contraseña de un no-admin sin email: verifica la actual con el email del perfil", async () => {
    const fake = createSupabaseFake();
    prepararActualizacion(fake);
    await createOrUpdateUser(fake.client, {
      id: "u1",
      email: undefined as unknown as string,
      full_name: "",
      newPassword: "nueva123",
      currentPassword: "vieja123",
      isSuperAdmin: false,
    });
    const login = fake.calls.find((c) => c.kind === "auth" && c.table === "signInWithPassword");
    expect(login?.payload).toEqual([{ email: "socio@gym.local", password: "vieja123" }]);
  });
});
