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
    const { payment_method, receipt_url, payment_note, detalles } = body;

    if (!detalles || !Array.isArray(detalles) || detalles.length === 0) {
      throw new Error("Se requiere al menos un detalle de pago");
    }

    const { data: pago, error: pagoError } = await supabase
      .from("payments")
      .insert({
        user_id: user.id,
        status: "pendiente",
        payment_method: payment_method || "efectivo",
        receipt_url: receipt_url || null,
        payment_note: payment_note || null,
      })
      .select()
      .single();

    if (pagoError) throw pagoError;

    const detalleRows = detalles.map((d: { month_number: number | null; year_number: number | null; payment_type: string; payment_amount: number }) => ({
      payment_id: pago.id,
      month_number: d.month_number,
      year_number: d.year_number,
      payment_type: d.payment_type,
      payment_amount: d.payment_amount,
    }));

    const { error: detalleError } = await supabase
      .from("payment_detail")
      .insert(detalleRows);

    if (detalleError) {
      await supabase.from("payments").delete().eq("id", pago.id);
      throw detalleError;
    }

    return new Response(JSON.stringify({ success: true, data: { ...pago, detail: detalleRows } }), {
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
