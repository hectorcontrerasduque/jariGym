import { createClient } from "@/lib/supabase/client";
import type { GymConfig } from "@/lib/types";

export class ConfigService {
  private supabase = createClient();

  async getConfig(): Promise<GymConfig | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await this.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) return null;

    const { data } = await this.supabase
      .from("gym_config")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .single();

    return data;
  }

  async updateConfig(updates: Partial<GymConfig>): Promise<GymConfig> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    const { data: profile } = await this.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) throw new Error("Sin tenant asignado");

    const { data: existing } = await this.supabase
      .from("gym_config")
      .select("id")
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (existing) {
      const { data, error } = await this.supabase
        .from("gym_config")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await this.supabase
        .from("gym_config")
        .insert({ ...updates, tenant_id: profile.tenant_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  }
}

export const configService = new ConfigService();
