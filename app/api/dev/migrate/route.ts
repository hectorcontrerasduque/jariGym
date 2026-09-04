import { NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { messages } from "@/lib/messages";
import {
  migrateProdToDev,
  testConnection,
} from "@/lib/services/dev/migration.service";

function isDevMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SITE_URL || "";
  return url.includes("dev") || url.includes("localhost");
}

export async function GET() {
  if (!isDevMode()) {
    return NextResponse.json(
      { error: messages.dev.soloDisponibleEnDev },
      { status: 403 }
    );
  }

  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: messages.toast.noAutenticado },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    return NextResponse.json(
      { error: messages.toast.noAutorizado },
      { status: 403 }
    );
  }

  const prodUrl = process.env.PROD_DATABASE_URL;
  if (!prodUrl) {
    return NextResponse.json(
      { configured: false, message: "PROD_DATABASE_URL no configurada" },
      { status: 200 }
    );
  }

  const result = await testConnection(prodUrl);
  return NextResponse.json({
    configured: true,
    connected: result.ok,
    tables: result.tables,
    error: result.error,
  });
}

export async function POST(request: Request) {
  if (!isDevMode()) {
    return NextResponse.json(
      { error: messages.dev.soloDisponibleEnDev },
      { status: 403 }
    );
  }

  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: messages.toast.noAutenticado },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    return NextResponse.json(
      { error: messages.toast.noAutorizado },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const prodUrl = (body.prodDatabaseUrl as string) || process.env.PROD_DATABASE_URL;
  if (!prodUrl) {
    return NextResponse.json(
      { error: messages.dev.urlProdRequerida },
      { status: 400 }
    );
  }

  const devUrl = process.env.SUPABASE_DATABASE_URL;
  if (!devUrl) {
    return NextResponse.json(
      { error: "SUPABASE_DATABASE_URL no configurada en el servidor" },
      { status: 500 }
    );
  }

  try {
    const results = await migrateProdToDev(prodUrl, devUrl);
    const totalRows = results.reduce((sum, r) => sum + r.rows, 0);
    const errors = results.filter((r) => !r.ok);

    return NextResponse.json({
      ok: errors.length === 0,
      results,
      summary: {
        tables: results.length,
        totalRows,
        errors: errors.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
