import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["super_admin", "admin"].includes(profile.role)) {
      throw new Error("Forbidden: Admin access required");
    }

    const { pago_id, accion, notas } = await req.json();

    if (!pago_id || !accion) {
      throw new Error("pago_id and accion are required");
    }

    const { data: existingPago } = await supabase
      .from("pagos")
      .select("estado")
      .eq("id", pago_id)
      .single();

    if (existingPago && existingPago.estado !== "pendiente") {
      throw new Error("El pago ya fue procesado");
    }

    const updates: Record<string, unknown> = {
      estado: accion === "aprobar" ? "aprobado" : "rechazado",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    };

    if (accion === "rechazar" && notas) {
      updates.notas = notas;
    }

    const { data, error } = await supabase
      .from("pagos")
      .update(updates)
      .eq("id", pago_id)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
