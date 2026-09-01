import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("gym_config")
    .select("gym_name, logo_url, owner_email")
    .limit(1)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ gym_name: "GymApp" });
  return NextResponse.json(data);
}
