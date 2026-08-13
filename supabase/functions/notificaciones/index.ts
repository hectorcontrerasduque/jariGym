import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const { data: pagosPendientes, error } = await supabase
      .from("pagos")
      .select(`
        *,
        profile:profiles(nombre_completo, id),
        notificaciones_config:notificaciones_config(whatsapp_enabled, email_enabled, whatsapp_number)
      `)
      .eq("estado", "pendiente")
      .lt("created_at", primerDiaMes.toISOString());

    if (error) throw error;

    const resultados = [];

    for (const pago of pagosPendientes || []) {
      const notisConfig = (pago as any).notificaciones_config;
      const profile = (pago as any).profile;

      if (notisConfig?.email_enabled) {
        console.log(
          `Enviando email a ${profile?.nombre_completo}: Pago pendiente de ${new Date(pago.created_at).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}`
        );

        await supabase.from("notificaciones_log").insert({
          tenant_id: pago.tenant_id,
          usuario_id: pago.usuario_id,
          tipo: "pago_pendiente",
          canal: "email",
          enviado: true,
        });

        resultados.push({
          usuario_id: pago.usuario_id,
          canal: "email",
          estado: "enviado",
        });
      }

      if (notisConfig?.whatsapp_enabled && notisConfig?.whatsapp_number) {
        console.log(
          `Enviando WhatsApp a ${notisConfig.whatsapp_number}: Pago pendiente`
        );

        await supabase.from("notificaciones_log").insert({
          tenant_id: pago.tenant_id,
          usuario_id: pago.usuario_id,
          tipo: "pago_pendiente",
          canal: "whatsapp",
          enviado: true,
        });

        resultados.push({
          usuario_id: pago.usuario_id,
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
