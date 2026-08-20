import { messages } from "@/lib/messages";
import type { MigracionRecord } from "@/lib/types";

export class MigracionService {
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

  async pingEmail(email: string): Promise<{ exists: boolean }> {
    const res = await fetch(`/api/migracion/ping?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || messages.migracion.error);
    return data;
  }

  async migrate(params: {
    nombreCompleto: string;
    whatsapp: string;
    correo: string;
    password: string;
    selectedNombre?: string;
  }): Promise<{ success: boolean; email: string }> {
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
