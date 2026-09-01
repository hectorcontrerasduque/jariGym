import type { SupabaseClient } from "@supabase/supabase-js";

export interface CreateProfileOptions {
  id: string;
  email: string;
  full_name: string;
  role?: "super_admin" | "miembro";
  activo?: boolean;
  registered?: boolean;
  inscription_paid?: boolean;
  inscription_date?: string | null;
  start_date?: string;
  avatar_url?: string | null;
  phone_number?: string | null;
}

export async function createOrUpdateProfile(
  supabase: SupabaseClient,
  options: CreateProfileOptions
) {
  const {
    id,
    email,
    full_name,
    role = "miembro",
    activo = true,
    registered = true,
    inscription_paid = false,
    inscription_date = null,
    start_date = new Date().toISOString().split("T")[0],
    avatar_url = null,
    phone_number = null,
  } = options;

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id,
        email,
        full_name,
        role,
        activo,
        registered,
        inscription_paid,
        inscription_date,
        start_date,
        avatar_url,
        phone_number,
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}
