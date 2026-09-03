import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { messages } from "@/lib/messages";
import { getAdminLevel, isFullAdmin } from "@/lib/admin-level";

export async function POST(request: Request) {
  try {
    const supabase = await createAuthClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }

    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existingConfig } = await serviceSupabase
      .from("gym_config")
      .select("owner_email")
      .single();
    const adminLevel = getAdminLevel(user.email, existingConfig?.owner_email || null, process.env.NEXT_PUBLIC_ADMIN_EMAIL);
    if (!isFullAdmin(adminLevel)) {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }

    const body = await request.json();
    const { config: configUpdates, metodos } = body;

    // Read existing config
    const { data: existing } = await serviceSupabase
      .from("gym_config")
      .select("id, owner_email")
      .limit(1)
      .single();

    // Handle owner email change
    if (configUpdates?.owner_email && existing && configUpdates.owner_email !== existing.owner_email) {
      const { data: oldProfile } = await serviceSupabase
        .from("profiles")
        .select("id")
        .eq("email", existing.owner_email)
        .maybeSingle();
      if (oldProfile) {
        await serviceSupabase
          .from("profiles")
          .update({ activo: false })
          .eq("id", oldProfile.id);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/api/auth/ensure-super-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          email: configUpdates.owner_email,
          nombre: configUpdates.owner_name,
          inscription_paid: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return NextResponse.json({ error: body.error || "Error creando profile del propietario" }, { status: 500 });
      }
    }

    // Strip read-only fields
    const { id, created_at, updated_at, created_by, updated_by, ...safeUpdates } = configUpdates || {}; // eslint-disable-line @typescript-eslint/no-unused-vars

    // Update or insert config
    if (existing) {
      const { error } = await serviceSupabase
        .from("gym_config")
        .update(safeUpdates)
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      const { error } = await serviceSupabase
        .from("gym_config")
        .insert(safeUpdates);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Save payment methods
    if (Array.isArray(metodos)) {
      const { data: existingMethods } = await serviceSupabase
        .from("gym_config_payment_methods")
        .select("*");

      for (const m of existingMethods || []) {
        if (m.is_active) {
          await serviceSupabase
            .from("gym_config_payment_methods")
            .update({ is_active: false, effective_to: new Date().toISOString().split("T")[0] })
            .eq("id", m.id);
        }
      }

      const activeMetodo = metodos.find((m: { is_active: boolean }) => m.is_active);
      if (activeMetodo) {
        await serviceSupabase.from("gym_config_payment_methods").insert({
          payment_method: activeMetodo.payment_method,
          amount_monthly: activeMetodo.amount_monthly,
          amount_inscription: activeMetodo.amount_inscription,
          is_active: true,
          effective_from: new Date().toISOString().split("T")[0],
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.toast.errorGenerico;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
