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
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || !["super_admin"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const { data: pagosPendientes, error } = await supabase
      .from("payments")
      .select(`
        *,
        profile:profiles(full_name, id)
      `)
      .eq("status", "pendiente")
      .lt("created_at", primerDiaMes.toISOString());

    if (error) throw error;

    const resultados = [];

    for (const pago of pagosPendientes || []) {
      const notisConfigResult = await supabase
        .from("notification_config")
        .select("notify_by_email, notify_by_whatsapp")
        .eq("notification_type", "miembros_deudores")
        .eq("is_active", true)
        .maybeSingle();

      const notisConfig = notisConfigResult.data;

      if (notisConfig?.notify_by_email) {
        await supabase.from("notification_log").insert({
          notification_config_id: (await supabase
            .from("notification_config")
            .select("id")
            .eq("notification_type", "miembros_deudores")
            .single()
          ).data?.id,
          members_notified: 1,
          no_issues: true,
          created_by: user.id,
        });

        resultados.push({
          user_id: pago.user_id,
          canal: "email",
          estado: "enviado",
        });
      }

      if (notisConfig?.notify_by_whatsapp) {
        await supabase.from("notification_log").insert({
          notification_config_id: (await supabase
            .from("notification_config")
            .select("id")
            .eq("notification_type", "miembros_deudores")
            .single()
          ).data?.id,
          members_notified: 1,
          no_issues: true,
          created_by: user.id,
        });

        resultados.push({
          user_id: pago.user_id,
          canal: "whatsapp",
          estado: "enviado",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pagosProcesados: pagosPendientes?.length || 0,
        notificacionesEnviadas: resultados.length,
        detalles: resultados,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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
