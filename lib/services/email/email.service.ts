import nodemailer from "nodemailer";
import { resetPasswordTemplate } from "./templates/reset-password";
import { welcomeTemplate } from "./templates/welcome";
import { deudasPendientesTemplate } from "./templates/deudas-pendientes";
import { recordatorioMiembroTemplate } from "./templates/recordatorio-miembro";
import { recordatorioAdminTemplate } from "./templates/recordatorio-admin";
import { resumenDuenoTemplate } from "./templates/resumen-dueno";
import { estatusSistemaTemplate } from "./templates/estatus-sistema";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ─── RATE LIMITING ────────────────────────────────────────────
// Gmail: 500/day (free), 2000/day (Workspace)
// Safe limit: 100/day with 3s delay between sends
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
function unsubscribeFooter(gymName: string, siteUrl: string): string {
  return `
    <div style="margin-top:30px;padding-top:15px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:11px;margin:0 0 5px;">
        ${gymName} &mdash; Notificación automática
      </p>
      <p style="color:#94a3b8;font-size:11px;margin:0;">
        Si no deseas recibir estos correos, contacta al administrador para desactivar las notificaciones.
      </p>
    </div>
  `;
}

// ─── SEND EMAIL ──────────────────────────────────────────────
interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
}

export async function sendEmail({
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
    headers: {
      "List-Unsubscribe": `<mailto:${process.env.GMAIL_USER}?subject=unsubscribe>`,
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
  deudas: Array<{ mes: number; anio: number; monto: number }>,
  totalDeuda: number,
  gymLogo?: string | null
): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const baseHtml = deudasPendientesTemplate(memberName, gymName, deudas, totalDeuda, gymLogo);
  await sendEmail({
    to,
    subject: `${gymName} - Tienes pagos pendientes`,
    html: baseHtml + unsubscribeFooter(gymName, siteUrl),
    fromName: gymName,
  });
}

// ─── PAYMENT REMINDER ────────────────────────────────────────
export async function sendPaymentReminderEmail(
  to: string,
  memberName: string,
  gymName: string,
  diasRestantes: number,
  fechaVencimiento: string,
  gymLogo?: string | null
): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const baseHtml = recordatorioMiembroTemplate(memberName, gymName, diasRestantes, fechaVencimiento, gymLogo);
  await sendEmail({
    to,
    subject: `${gymName} - Tu membresía vence en ${diasRestantes} días`,
    html: baseHtml + unsubscribeFooter(gymName, siteUrl),
    fromName: gymName,
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
  gymLogo?: string | null
): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const baseHtml = recordatorioAdminTemplate(adminName, gymName, miembrosProximoVencer, gymLogo);
  await sendEmail({
    to,
    subject: `${gymName} - Miembros con membresía por vencer`,
    html: baseHtml + unsubscribeFooter(gymName, siteUrl),
    fromName: gymName,
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
  },
  appUrl: string,
  gymLogo?: string | null
): Promise<void> {
  const baseHtml = resumenDuenoTemplate(gymName, resumen, appUrl, gymLogo);
  await sendEmail({
    to,
    subject: `${gymName} - Resumen de pagos`,
    html: baseHtml + unsubscribeFooter(gymName, appUrl),
    fromName: gymName,
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
  },
  gymLogo?: string | null
): Promise<void> {
  const baseHtml = estatusSistemaTemplate(gymName, metricas, gymLogo);
  await sendEmail({
    to,
    subject: `${gymName} - Estado del Sistema`,
    html: baseHtml + unsubscribeFooter(gymName, process.env.NEXT_PUBLIC_SITE_URL || ""),
    fromName: gymName,
  });
}

export { sleep };
