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
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const body = await req.json();
    const { metodo_pago, comprobante_url, notas, detalles } = body;

    if (!detalles || !Array.isArray(detalles) || detalles.length === 0) {
      throw new Error("Se requiere al menos un detalle de pago");
    }

    const { data: pago, error: pagoError } = await supabase
      .from("pagos")
      .insert({
        usuario_id: user.id,
        estado: "pendiente",
        metodo_pago: metodo_pago || "efectivo",
        comprobante_url: comprobante_url || null,
        notas: notas || null,
      })
      .select()
      .single();

    if (pagoError) throw pagoError;

    const detalleRows = detalles.map((d: { mes: number | null; anio: number | null; tipo_pago: string; monto: number }) => ({
      pago_id: pago.id,
      mes: d.mes,
      anio: d.anio,
      tipo_pago: d.tipo_pago,
      monto: d.monto,
    }));

    const { error: detalleError } = await supabase
      .from("detalle_pago")
      .insert(detalleRows);

    if (detalleError) {
      await supabase.from("pagos").delete().eq("id", pago.id);
      throw detalleError;
    }

    return new Response(JSON.stringify({ success: true, data: { ...pago, detalle: detalleRows } }), {
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
