import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/services/email/email.service";
import { messages } from "@/lib/messages";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const RATE_LIMIT_WINDOW = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: messages.auth.userNotFound }, { status: 400 });
    }

    const supabase = getAdminClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .single();

    if (!profile) {
      return NextResponse.json({ message: messages.auth.resetPasswordSent });
    }

    const { count } = await supabase
      .from("password_reset_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .gte("created_at", new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString());

    if (count && count >= MAX_REQUESTS_PER_WINDOW) {
      return NextResponse.json({ error: messages.auth.tooManyRequests }, { status: 429 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id: profile.id,
        token,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      return NextResponse.json({ error: messages.auth.resetPasswordError }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const resetLink = `${siteUrl}/reset-password?token=${token}`;

    const { data: gymConfig } = await supabase
      .from("gym_config")
      .select("nombre_gym")
      .limit(1)
      .single();

    const gymName = gymConfig?.nombre_gym || "GymApp";

    await sendPasswordResetEmail(email, resetLink, gymName);

    return NextResponse.json({ message: messages.auth.resetPasswordSent });
  } catch {
    return NextResponse.json(
      { error: messages.auth.resetPasswordError },
      { status: 500 }
    );
  }
}
