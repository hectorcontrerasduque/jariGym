import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { messages } from "@/lib/messages";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return NextResponse.json({ error: messages.toast.noAutenticado }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin" && profile?.role !== "admin") {
      return NextResponse.json({ error: messages.toast.noAutorizado }, { status: 403 });
    }

    const resultados: Array<{
      paso: string;
      estado: "ok" | "error" | "warning";
      detalle: string;
    }> = [];

    // 1. Variables de entorno
    const gmailUser = !!process.env.GMAIL_USER;
    const gmailPass = !!process.env.GMAIL_APP_PASSWORD;
    resultados.push({
      paso: "Variables de entorno",
      estado: gmailUser && gmailPass ? "ok" : "error",
      detalle: gmailUser && gmailPass
        ? "GMAIL_USER y GMAIL_APP_PASSWORD configurados"
        : "Faltan variables de entorno de Gmail",
    });

    // 2. Conexion SMTP
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });
      await transporter.verify();
      resultados.push({
        paso: "Conexion SMTP",
        estado: "ok",
        detalle: "Conexion con Gmail exitosa",
      });
    } catch (e) {
      resultados.push({
        paso: "Conexion SMTP",
        estado: "error",
        detalle: `Error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    // 3. Tabla gym_config
    const { data: gymConfig } = await supabase
      .from("gym_config")
      .select("id, notificaciones_enabled")
      .limit(1)
      .single();
    resultados.push({
      paso: "Tabla gym_config",
      estado: gymConfig ? "ok" : "error",
      detalle: gymConfig
        ? `Config existe. Notificaciones: ${gymConfig.notificaciones_enabled ? "habilitadas" : "deshabilitadas"}`
        : "No hay configuracion del gym",
    });

    // 4. Tabla notificacion_config
    const { data: notifConfigs } = await supabase
      .from("notificacion_config")
      .select("id");
    resultados.push({
      paso: "Tabla notificacion_config",
      estado: notifConfigs && notifConfigs.length > 0 ? "ok" : "warning",
      detalle: notifConfigs
        ? `${notifConfigs.length} configuraciones registradas`
        : "No hay configuraciones de notificacion",
    });

    // 5. Tabla notificacion_log
    const { count: logCount } = await supabase
      .from("notificacion_log")
      .select("id", { count: "exact", head: true });
    resultados.push({
      paso: "Tabla notificacion_log",
      estado: "ok",
      detalle: `${logCount || 0} registros en historial`,
    });

    // 6. Miembros activos con email
    const { count: miembrosCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "miembro")
      .or("activo.eq.true,activo.is.null")
      .not("email", "is", null);
    resultados.push({
      paso: "Miembros activos",
      estado: miembrosCount && miembrosCount > 0 ? "ok" : "warning",
      detalle: miembrosCount
        ? `${miembrosCount} miembros activos con email`
        : "No hay miembros activos con email",
    });

    // 7. Pagos pendientes
    const { count: pagosPendientes } = await supabase
      .from("pagos")
      .select("id", { count: "exact", head: true })
      .in("estado", ["pendiente", "suspendido"]);
    resultados.push({
      paso: "Pagos pendientes",
      estado: "ok",
      detalle: `${pagosPendientes || 0} pagos pendientes/vencidos`,
    });

    // 8. Ultimo envio
    const { data: ultimoLog } = await supabase
      .from("notificacion_log")
      .select("fecha_hora_envio")
      .order("fecha_hora_envio", { ascending: false })
      .limit(1)
      .single();
    resultados.push({
      paso: "Ultimo envio",
      estado: "ok",
      detalle: ultimoLog
        ? `Ultimo envio: ${new Date(ultimoLog.fecha_hora_envio).toLocaleString("es-ES")}`
        : "Nunca se han enviado notificaciones",
    });

    const exitoso = resultados.every((r) => r.estado !== "error");
    return NextResponse.json({ exitoso, resultados });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
