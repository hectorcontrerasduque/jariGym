import nodemailer from "nodemailer";
import { resetPasswordTemplate } from "./templates/reset-password";
import { welcomeTemplate } from "./templates/welcome";
import { deudasPendientesTemplate } from "./templates/deudas-pendientes";
import { recordatorioMiembroTemplate } from "./templates/recordatorio-miembro";
import { recordatorioAdminTemplate } from "./templates/recordatorio-admin";
import { resumenDuenoTemplate } from "./templates/resumen-dueno";
import { estatusSistemaTemplate } from "./templates/estatus-sistema";
import { diagnosticoTemplate } from "./templates/diagnostico";
import { errorReportTemplate } from "./templates/error-report";
import { pagoAprobadoTemplate } from "./templates/pago-aprobado";
import { pagoRechazadoTemplate } from "./templates/pago-rechazado";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ─── RATE LIMITING ────────────────────────────────────────────
const EMAIL_DELAY_MS = 3000;
let lastEmailSentAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastEmailSentAt;
  if (elapsed < EMAIL_DELAY_MS) {
    await sleep(EMAIL_DELAY_MS - elapsed);
  }
  lastEmailSentAt = Date.now();
}

// ─── UNSUBSCRIBE FOOTER ──────────────────────────────────────
function unsubscribeFooter(gymName: string, direccion?: string | null): string {
  const addressHtml = direccion
    ? `<p style="color:#94a3b8;font-size:11px;margin:0 0 5px;">${direccion}</p>`
    : "";
  return `
    <div style="margin-top:30px;padding-top:15px;border-top:1px solid #e2e8f0;text-align:center;">
      ${addressHtml}
      <p style="color:#94a3b8;font-size:11px;margin:0 0 5px;">
        ${gymName} &mdash; Notificación automática
      </p>
      <p style="color:#94a3b8;font-size:11px;margin:0;">
        Si no deseas recibir estos correos, contacta al administrador para desactivar las notificaciones.
      </p>
    </div>
  `;
}

// ─── SEND EMAIL (transactional) ──────────────────────────────
interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
}

async function sendEmail({
  to,
  subject,
  html,
  fromName,
}: SendEmailParams): Promise<void> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be configured");
  }

  await rateLimit();

  const result = await transporter.sendMail({
    from: `"${fromName || "GymApp"}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    replyTo: process.env.GMAIL_USER,
  });

  if (!result.messageId) {
    throw new Error("Email sent but no messageId returned");
  }
}

// ─── SEND NOTIFICATION (batch/Marketing headers) ─────────────
async function sendNotificationEmail({
  to,
  subject,
  html,
  fromName,
  campaign,
}: SendEmailParams & { campaign: string }): Promise<void> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be configured");
  }

  await rateLimit();

  const result = await transporter.sendMail({
    from: `"${fromName || "GymApp"}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    replyTo: process.env.GMAIL_USER,
    headers: {
      "List-Unsubscribe": `<mailto:${process.env.GMAIL_USER}?subject=unsubscribe>`,
      "Precedence": "bulk",
      "X-Campaign": campaign,
      "X-Mailer": "GymApp-Notifications",
    },
  });

  if (!result.messageId) {
    throw new Error("Email sent but no messageId returned");
  }
}

// ─── PASSWORD RESET ──────────────────────────────────────────
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  gymName: string,
  gymLogo?: string | null
): Promise<void> {
  await sendEmail({
    to,
    subject: `${gymName} - Restablecer Contraseña`,
    html: resetPasswordTemplate(resetLink, gymName, gymLogo),
    fromName: gymName,
  });
}

// ─── WELCOME ─────────────────────────────────────────────────
export async function sendWelcomeEmail(
  to: string,
  email: string,
  password: string,
  gymName: string,
  gymLogo?: string | null,
  confirmLink?: string
): Promise<void> {
  await sendEmail({
    to,
    subject: `${gymName} - Bienvenido`,
    html: welcomeTemplate(email, password, gymName, gymLogo, confirmLink),
    fromName: gymName,
  });
}

// ─── DEBT NOTIFICATION ───────────────────────────────────────
export async function sendPaymentDebtEmail(
  to: string,
  memberName: string,
  gymName: string,
  deudas: Array<{ month_number: number; year_number: number; payment_amount: number }>,
  totalDeuda: number,
  gymLogo?: string | null,
  direccion?: string | null
): Promise<void> {
  const baseHtml = deudasPendientesTemplate(memberName, gymName, deudas, totalDeuda, gymLogo);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Pago pendiente de ${memberName}`,
    html: baseHtml + unsubscribeFooter(gymName, direccion),
    fromName: gymName,
    campaign: "deudas-pendientes",
  });
}

// ─── PAYMENT REMINDER ────────────────────────────────────────
export async function sendPaymentReminderEmail(
  to: string,
  memberName: string,
  gymName: string,
  diasRestantes: number,
  fechaVencimiento: string,
  gymLogo?: string | null,
  direccion?: string | null
): Promise<void> {
  const baseHtml = recordatorioMiembroTemplate(memberName, gymName, diasRestantes, fechaVencimiento, gymLogo);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Tu membresía vence en ${diasRestantes} día${diasRestantes !== 1 ? "s" : ""}`,
    html: baseHtml + unsubscribeFooter(gymName, direccion),
    fromName: gymName,
    campaign: "recordatorio-pago",
  });
}

// ─── ADMIN REMINDER ──────────────────────────────────────────
export async function sendAdminReminderEmail(
  to: string,
  adminName: string,
  gymName: string,
  miembrosProximoVencer: Array<{
    nombre: string;
    diasRestantes: number;
    fechaVencimiento: string;
  }>,
  gymLogo?: string | null,
  direccion?: string | null
): Promise<void> {
  const baseHtml = recordatorioAdminTemplate(adminName, gymName, miembrosProximoVencer, gymLogo);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Miembros con membresía por vencer`,
    html: baseHtml + unsubscribeFooter(gymName, direccion),
    fromName: gymName,
    campaign: "recordatorio-admin",
  });
}

// ─── ADMIN SUMMARY ───────────────────────────────────────────
export async function sendAdminSummaryEmail(
  to: string,
  gymName: string,
  resumen: {
    pagosAprobados: number;
    pagosPendientes: number;
    montoCobrado: number;
    montoPendiente: number;
    miembrosAlDia: number;
    miembrosDeudores: number;
    migraciones: number;
  },
  appUrl: string,
  gymLogo?: string | null,
  direccion?: string | null
): Promise<void> {
  const baseHtml = resumenDuenoTemplate(gymName, resumen, appUrl, gymLogo);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Resumen semanal de pagos`,
    html: baseHtml + unsubscribeFooter(gymName, direccion),
    fromName: gymName,
    campaign: "resumen-dueno",
  });
}

// ─── SYSTEM STATUS ───────────────────────────────────────────
export async function sendSystemStatusEmail(
  to: string,
  gymName: string,
  metricas: {
    totalMiembrosActivos: number;
    totalMiembrosInactivos: number;
    pagosAprobadosMes: number;
    pagosPendientesMes: number;
    montoRecaudadoMes: number;
    montoPendienteMes: number;
    capacidad: number;
    maxMiembros: number;
    ultimoMiembroRegistrado: string;
    ultimoPagoRegistrado: string;
    migraciones: number;
  },
  gymLogo?: string | null,
  direccion?: string | null,
  erroresRecientes?: Array<{ tipo: string; fecha: string; detalle: string }>
): Promise<void> {
  const baseHtml = estatusSistemaTemplate(gymName, metricas, gymLogo, erroresRecientes);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Estado del sistema`,
    html: baseHtml + unsubscribeFooter(gymName, direccion),
    fromName: gymName,
    campaign: "estatus-sistema",
  });
}

// ─── DIAGNOSTIC ──────────────────────────────────────────────
export async function sendDiagnosticoEmail(
  to: string,
  gymName: string,
  resultados: Array<{ paso: string; estado: "ok" | "error" | "warning"; detalle: string }>,
  gymLogo?: string | null,
  direccion?: string | null
): Promise<void> {
  const baseHtml = diagnosticoTemplate(resultados, gymName, gymLogo);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Diagnóstico del sistema`,
    html: baseHtml + unsubscribeFooter(gymName, direccion),
    fromName: gymName,
    campaign: "diagnostico",
  });
}

// ─── ERROR REPORT ────────────────────────────────────────────
export async function sendErrorReportEmail(
  to: string,
  gymName: string,
  errorInfo: {
    paso: string;
    mensaje: string;
    timestamp: string;
    contexto: Record<string, unknown>;
  },
  gymLogo?: string | null,
  direccion?: string | null
): Promise<void> {
  const baseHtml = errorReportTemplate(errorInfo, gymName, gymLogo);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Error en notificaciones`,
    html: baseHtml + unsubscribeFooter(gymName, direccion),
    fromName: gymName,
    campaign: "error-report",
  });
}

// ─── PAYMENT APPROVED ──────────────────────────────────────
export async function sendPaymentApprovedEmail(
  to: string,
  memberName: string,
  gymName: string,
  monto: number,
  meses: Array<{ month_number: number; year_number: number }>,
  metodoPago: string,
  gymLogo?: string | null
): Promise<void> {
  const html = pagoAprobadoTemplate(memberName, gymName, monto, meses, metodoPago, gymLogo);
  await sendEmail({
    to,
    subject: `✅ Pago aprobado - ${gymName}`,
    html,
    fromName: gymName,
  });
}

// ─── PAYMENT REJECTED ──────────────────────────────────────
export async function sendPaymentRejectedEmail(
  to: string,
  memberName: string,
  gymName: string,
  monto: number,
  meses: Array<{ month_number: number; year_number: number }>,
  metodoPago: string,
  motivo: string,
  gymLogo?: string | null
): Promise<void> {
  const html = pagoRechazadoTemplate(memberName, gymName, monto, meses, metodoPago, motivo, gymLogo);
  await sendEmail({
    to,
    subject: `❌ Pago rechazado - ${gymName}`,
    html,
    fromName: gymName,
  });
}

export { sleep };
