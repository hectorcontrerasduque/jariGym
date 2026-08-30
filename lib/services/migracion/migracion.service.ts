import { messages } from "@/lib/messages";

export interface MigracionRecord {
  nombre: string;
  correos: string[];
  migrado: string;
}

export class MigracionService {
  async listAll(): Promise<MigracionRecord[]> {
    const res = await fetch("/api/migracion/list");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || messages.migracion.error);
    return data.records || [];
  }

  async searchByName(nombreCompleto: string): Promise<string[]> {
    const res = await fetch("/api/migracion/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombreCompleto }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || messages.migracion.error);
    return data.matches || [];
  }

  async pingEmail(email: string): Promise<{ exists: boolean; alreadyMigrated: boolean; nombre: string | null }> {
    const res = await fetch(`/api/migracion/ping?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || messages.migracion.error);
    return data;
  }

  async migrate(params: {
    nombreCompleto: string;
    phone_number: string;
    correo: string;
    password: string;
    selectedNombre?: string;
  }): Promise<{ success: boolean; email: string; existingUser?: boolean }> {
    const res = await fetch("/api/migracion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || messages.migracion.error);
    return data;
  }
}

export const migracionService = new MigracionService();
