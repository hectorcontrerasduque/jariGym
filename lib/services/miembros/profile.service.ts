import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWelcomeEmail } from "@/lib/services/email/email.service";

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

// ─── CREATE OR UPDATE USER (centralized) ──────────────────────
export interface CreateUserResult {
  user: Record<string, unknown>;
  userId: string;
  password?: string;
  welcomeEmailSent?: boolean;
  isNewAuthUser: boolean;
  emailUpdated?: boolean;
  passwordUpdated?: boolean;
}

export async function createOrUpdateUser(
  supabase: SupabaseClient,
  params: {
    email: string;
    full_name: string;
    password?: string;
    generatePassword?: boolean;
    email_confirm?: boolean;
    role?: "super_admin" | "miembro";
    id?: string;
    activo?: boolean;
    registered?: boolean;
    inscription_paid?: boolean;
    inscription_date?: string | null;
    start_date?: string;
    avatar_url?: string | null;
    phone_number?: string | null;
    document_id?: string | null;
    arrival_time?: string | null;
    departure_time?: string | null;
    inscription_admin_note?: string | null;
    newPassword?: string;
    currentPassword?: string;
    isSuperAdmin?: boolean;
    sendWelcome?: boolean;
    isOAuth?: boolean;
    gymName?: string;
    gymLogo?: string | null;
  }
): Promise<CreateUserResult> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(params.email)) {
    throw new Error("email_invalid");
  }
  if (params.email.length > 254) {
    throw new Error("email_too_long");
  }
  if (!params.full_name || !params.full_name.trim()) {
    throw new Error("name_required");
  }
  if (params.full_name.length > 200) {
    throw new Error("name_too_long");
  }
  if (params.password && params.password.length < 6) {
    throw new Error("password_too_short");
  }
  if (params.newPassword && params.newPassword.length < 6) {
    throw new Error("password_too_short");
  }

  const emailLower = params.email.toLowerCase().trim();
  const fullName = params.full_name.trim();

  // ── BUSCAR PROFILE EXISTENTE ──
  let existingProfile: Record<string, unknown> | null = null;

  if (params.id) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    existingProfile = data;
  }

  if (!existingProfile) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", emailLower)
      .maybeSingle();
    existingProfile = data;
  }

  // ── CASO: ACTUALIZACIÓN ──
  if (existingProfile) {
    const targetId = existingProfile.id as string;

    // Password update
    if (params.newPassword) {
      if (!params.isSuperAdmin) {
        if (!params.currentPassword) {
          throw new Error("current_password_required");
        }
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: emailLower,
          password: params.currentPassword,
        });
        if (verifyError) {
          throw new Error("current_password_wrong");
        }
      }

      const { error: pwError } = await supabase.auth.admin.updateUserById(
        targetId,
        { password: params.newPassword }
      );
      if (pwError) {
        throw new Error("password_update_failed");
      }
    }

    // Email update (super_admin only)
    let emailUpdated = false;
    if (params.email && params.email !== (existingProfile.email as string)) {
      if (!params.isSuperAdmin) {
        throw new Error("email_update_not_allowed");
      }

      const { data: dupProfile } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", emailLower)
        .neq("id", targetId)
        .maybeSingle();
      if (dupProfile) {
        throw new Error("email_duplicate");
      }

      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
        targetId,
        { email: emailLower, email_confirm: true }
      );
      if (authUpdateError) {
        throw new Error("email_update_failed");
      }
      emailUpdated = true;
    }

    // Profile update
    const profileUpdates: Record<string, unknown> = {};
    if (fullName) profileUpdates.full_name = fullName;
    if (emailUpdated || params.email) profileUpdates.email = emailLower;
    if (params.phone_number !== undefined) profileUpdates.phone_number = params.phone_number;
    if (params.document_id !== undefined) profileUpdates.document_id = params.document_id;
    if (params.arrival_time !== undefined) profileUpdates.arrival_time = params.arrival_time;
    if (params.departure_time !== undefined) profileUpdates.departure_time = params.departure_time;
    if (params.role) profileUpdates.role = params.role;
    if (params.inscription_admin_note !== undefined) profileUpdates.inscription_admin_note = params.inscription_admin_note;
    if (params.activo !== undefined) profileUpdates.activo = params.activo;
    if (params.registered !== undefined) profileUpdates.registered = params.registered;
    if (params.inscription_paid !== undefined) profileUpdates.inscription_paid = params.inscription_paid;
    if (params.inscription_date !== undefined) profileUpdates.inscription_date = params.inscription_date;
    if (params.start_date !== undefined) profileUpdates.start_date = params.start_date;
    if (params.avatar_url !== undefined) profileUpdates.avatar_url = params.avatar_url;

    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", targetId)
      .select()
      .single();

    if (updateError) {
      throw new Error("profile_update_failed");
    }

    // Send welcome email if email was updated
    let welcomeEmailSent = false;
    if (emailUpdated && params.sendWelcome) {
      try {
        let gymName = params.gymName || "Gym";
        let gymLogo = params.gymLogo || null;
        let address: string | null = null;
        if (!params.gymName || !params.gymLogo) {
          const { data: config } = await supabase
            .from("gym_config")
            .select("gym_name, logo_url, address")
            .maybeSingle();
          if (config?.gym_name) gymName = config.gym_name;
          if (config?.logo_url) gymLogo = config.logo_url;
          if (config?.address) address = config.address;
        }
        const pw = params.newPassword || params.password || "";
        await sendWelcomeEmail(emailLower, emailLower, pw, gymName, gymLogo, undefined, params.isOAuth, address || undefined);
        welcomeEmailSent = true;
      } catch { /* silent */ }
    }

    return {
      user: updatedProfile,
      userId: targetId,
      welcomeEmailSent,
      isNewAuthUser: false,
      emailUpdated,
      passwordUpdated: !!params.newPassword,
    };
  }

  // ── CASO: CREACIÓN ──
  // Check duplicate email in profiles
  const { data: dupByEmail } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", emailLower)
    .maybeSingle();
  if (dupByEmail) {
    throw new Error("email_duplicate");
  }

  // Check orphaned auth user (auth user exists but no profile)
  let userId: string;
  let isNewAuthUser = false;
  let generatedPassword = params.password || "";

  const { data: { users } } = await supabase.auth.admin.listUsers();
  const existingAuth = users?.find(u => u.email?.toLowerCase() === emailLower);

  if (existingAuth) {
    userId = existingAuth.id;
  } else {
    // Generate password if requested
    if (params.generatePassword || !generatedPassword) {
      generatedPassword = Math.random().toString(36).slice(-12) + "A1!";
    }

    const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
      email: emailLower,
      password: generatedPassword,
      email_confirm: params.email_confirm !== false,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      if (authError.message?.includes("already") || authError.message?.includes("exists")) {
        // Auth user exists but wasn't found by listUsers — try to get by email
        const { data: retryUsers } = await supabase.auth.admin.listUsers();
        const retryAuth = retryUsers?.users?.find(u => u.email?.toLowerCase() === emailLower);
        if (retryAuth) {
          userId = retryAuth.id;
        } else {
          throw new Error("auth_user_create_failed");
        }
      } else {
        throw new Error("auth_user_create_failed");
      }
    } else {
      userId = newUser!.user!.id;
      isNewAuthUser = true;
    }
  }

  // Create profile
  const profileData: Record<string, unknown> = {
    id: userId,
    email: emailLower,
    full_name: fullName,
    role: params.role || "miembro",
    activo: params.activo !== false,
    registered: params.registered !== false,
    inscription_paid: params.inscription_paid || false,
    inscription_date: params.inscription_date || null,
    start_date: params.start_date || new Date().toISOString().split("T")[0],
    avatar_url: params.avatar_url || null,
    phone_number: params.phone_number || null,
    document_id: params.document_id || null,
    arrival_time: params.arrival_time || null,
    departure_time: params.departure_time || null,
    inscription_admin_note: params.inscription_admin_note || null,
  };

  const { data: newProfile, error: profileError } = await supabase
    .from("profiles")
    .upsert(profileData, { onConflict: "id" })
    .select()
    .single();

  if (profileError) {
    // Integrity: delete auth user if profile creation fails
    if (isNewAuthUser) {
      await supabase.auth.admin.deleteUser(userId);
    }
    throw new Error("profile_create_failed");
  }

  // Send welcome email
  let welcomeEmailSent = false;
  if (params.sendWelcome) {
    try {
      let gymName = params.gymName || "Gym";
      let gymLogo = params.gymLogo || null;
      let address: string | null = null;
      if (!params.gymName || !params.gymLogo) {
        const { data: config } = await supabase
          .from("gym_config")
          .select("gym_name, logo_url, address")
          .maybeSingle();
        if (config?.gym_name) gymName = config.gym_name;
        if (config?.logo_url) gymLogo = config.logo_url;
        if (config?.address) address = config.address;
      }
      const isOAuthUser = params.isOAuth || (existingAuth?.app_metadata?.providers?.length ?? 0) > 0;
      await sendWelcomeEmail(emailLower, emailLower, generatedPassword, gymName, gymLogo, undefined, isOAuthUser, address || undefined);
      welcomeEmailSent = true;
    } catch { /* silent */ }
  }

  return {
    user: newProfile,
    userId,
    password: generatedPassword || undefined,
    welcomeEmailSent,
    isNewAuthUser,
  };
}
