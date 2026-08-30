import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface RateLimitConfig {
  max: number;
  windowMs: number;
  prefix?: string;
}

const LAZY_CLEANUP_PROBABILITY = 0.01;

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}

export async function applyRateLimit(
  request: Request,
  config: RateLimitConfig,
  customKey?: string
): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const key = `rl:${config.prefix || "api"}:${customKey || ip}`;
  const windowSec = Math.ceil(config.windowMs / 1000);

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("increment_api_rate_limit", {
    p_key: key,
    p_max: config.max,
    p_window_seconds: windowSec,
  });

  if (error) {
    return null;
  }

  if (!data?.[0]?.success) {
    const reset = data![0]!.reset;
    const retryAfter = Math.ceil((new Date(reset).getTime() - Date.now()) / 1000);

    return NextResponse.json(
      { error: "Demasiadas peticiones. Intenta más tarde." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(config.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(new Date(reset).getTime() / 1000)),
        },
      }
    );
  }

  if (Math.random() < LAZY_CLEANUP_PROBABILITY) {
    supabase
      .from("api_rate_limits")
      .delete()
      .lt("reset_at", new Date().toISOString())
      .then(() => {});
  }

  return null;
}