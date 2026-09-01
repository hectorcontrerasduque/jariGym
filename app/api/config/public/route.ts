import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [configResult, metodosResult] = await Promise.all([
    supabase.from("gym_config").select("*").limit(1).maybeSingle(),
    supabase.from("gym_config_payment_methods").select("*").order("payment_method"),
  ]);

  return NextResponse.json({
    config: configResult.data || null,
    metodos: metodosResult.data || [],
  });
}
