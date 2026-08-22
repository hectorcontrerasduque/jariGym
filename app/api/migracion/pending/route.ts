import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { count, error } = await supabase
    .from("migracion")
    .select("id", { count: "exact", head: true })
    .eq("migrado", "no");

  if (error) return NextResponse.json({ pending: false });
  return NextResponse.json({ pending: (count || 0) > 0 });
}
