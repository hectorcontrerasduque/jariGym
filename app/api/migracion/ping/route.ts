import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { messages } from "@/lib/messages";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email || typeof email !== "string") {
      return NextResponse.json({ exists: false });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ exists: false, invalid: true });
    }

    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    return NextResponse.json({ exists: !!data });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
