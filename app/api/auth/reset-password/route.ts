import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";
import { createClient } from "@supabase/supabase-js";
import { applyRateLimit } from "@/lib/middleware/rate-limit";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const rateLimitResponse = await applyRateLimit(request, {
    max: 5,
    windowMs: 20 * 60 * 1000,
    prefix: "auth",
  });
  if (rateLimitResponse) return rateLimitResponse;
  
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: messages.auth.resetPasswordInvalidToken }, { status: 400 });
    }

    const supabase = getAdminClient();

    const { data: tokenRecord, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token", token)
      .single();

    if (tokenError || !tokenRecord) {
      return NextResponse.json({ error: messages.auth.resetPasswordInvalidToken }, { status: 400 });
    }

    if (tokenRecord.used_at) {
      return NextResponse.json({ error: messages.auth.resetPasswordInvalidToken }, { status: 400 });
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      return NextResponse.json({ error: messages.auth.resetPasswordTokenExpired }, { status: 400 });
    }

    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenRecord.id);

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      tokenRecord.user_id,
      { password }
    );

    if (updateError) {
      return NextResponse.json({ error: messages.auth.resetPasswordError }, { status: 500 });
    }

    return NextResponse.json({ message: messages.auth.resetPasswordSuccess });
  } catch {
    return NextResponse.json(
      { error: messages.auth.resetPasswordError },
      { status: 500 }
    );
  }
}
