import nodemailer, { type SendMailOptions } from "nodemailer";
import QRCode from "qrcode";
import { resetPasswordTemplate } from "./templates/reset-password";
import { welcomeTemplate } from "./templates/welcome";
import { deudasPendientesTemplate } from "./templates/deudas-pendientes";
import { recordatorioMiembroTemplate } from "./templates/recordatorio-miembro";
import { recordatorioAdminTemplate } from "./templates/recordatorio-admin";
import { resumenDuenoTemplate } from "./templates/resumen-dueno";
import { estatusSistemaTemplate } from "./templates/estatus-sistema";
import { diagnosticoTemplate } from "./templates/diagnostico";
import { pagoAprobadoTemplate } from "./templates/pago-aprobado";
import { pagoRechazadoTemplate } from "./templates/pago-rechazado";
import type { EstatusSistema, ResumenDueno } from "@/lib/features/notificaciones/datos";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  connectionTimeout: 10000,
  greetingTimeout: 5000,
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

/** Envío con un reintento (2 s) si el transporte falla o no devuelve messageId. */
async function enviarConReintento(mailOptions: SendMailOptions): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const result = await transporter.sendMail(mailOptions);
      if (!result.messageId) {
        throw new Error("Email sent but no messageId returned");
      }
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) await sleep(2000);
    }
  }
  throw lastError;
}

// ─── QR CODE (cached PNG buffer for CID embedding) ───────────
const APP_URL = "https://jarigym.vercel.app/login";
let cachedQrBuffer: Buffer | null = null;

async function getQrBuffer(): Promise<Buffer> {
  if (cachedQrBuffer) return cachedQrBuffer;
  cachedQrBuffer = await QRCode.toBuffer(APP_URL, {
    type: "png",
    width: 200,
    margin: 1,
    color: { dark: "#0B1120", light: "#ffffff" },
  });
  return cachedQrBuffer;
}

function qrAttachment(): Promise<NonNullable<SendMailOptions["attachments"]>> {
  return getQrBuffer().then((buf) => [
    { filename: "qr-login.png", content: buf, cid: "qr-login" },
  ]);
}

// ─── ACCESS SECTION (QR or link-only, injected after header) ──
function seccionAccesoHtml(conQr: boolean): string {
  const cuerpo = conQr
    ? `<p style="color:#64748b;font-size:13px;margin:0 0 12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Escanea para acceder</p>
                    <img src="cid:qr-login" alt="QR Acceso" width="160" height="160" style="display:block;margin:0 auto 12px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                    <a href="${APP_URL}" style="color:#38bdf8;font-size:13px;text-decoration:none;font-weight:600;">${APP_URL.replace("https://", "")}</a>`
    : `<p style="color:#64748b;font-size:13px;margin:0 0 12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Accede al sistema</p>
                    <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:bold;">Ir al sistema</a>`;

  return `
          <tr>
            <td style="padding:0 30px 20px;background-color:#ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:12px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:24px;text-align:center;">
                    ${cuerpo}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

// ─── INJECT ACCESS SECTION AFTER HEADER ─────────────────────
function injectSeccionAcceso(html: string, conQr: boolean): string {
  const seccion = seccionAccesoHtml(conQr);
  const marker = "</tr>\n          <tr>\n            <td style=\"padding:30px;\">";
  const replacement = `</tr>\n${seccion}\n          <tr>\n            <td style="padding:30px;">`;
  if (html.includes(marker)) {
    return html.replace(marker, replacement);
  }
  const markerAlt = '</tr>\n          <tr>\n            <td style="padding:30px;">';
  if (html.includes(markerAlt)) {
    return html.replace(markerAlt, replacement);
  }
  return html;
}

// ─── SHARED FOOTER (branding only) ──────────────────────────
function sharedFooter(gymName: string, address?: string | null): string {
  const addressHtml = address
    ? `<p style="color:#94a3b8;font-size:11px;margin:0 0 5px;">${address}</p>`
    : "";
  return `
    <tr>
      <td style="background-color:#f8fafc;padding:20px 30px;border-top:1px solid #e2e8f0;text-align:center;">
        ${addressHtml}
        <p style="color:#94a3b8;font-size:11px;margin:6px 0 0;">
          ${gymName} &mdash; Gestión de gimnasio inteligente
        </p>
      </td>
    </tr>`;
}

// ─── UNSUBSCRIBE FOOTER (notifications) ──────────────────────
function unsubscribeFooter(gymName: string, address?: string | null): string {
  const addressHtml = address
    ? `<p style="color:#94a3b8;font-size:11px;margin:0 0 5px;">${address}</p>`
    : "";
  return `
    <tr>
      <td style="background-color:#f8fafc;padding:20px 30px;border-top:1px solid #e2e8f0;text-align:center;">
        ${addressHtml}
        <p style="color:#94a3b8;font-size:11px;margin:6px 0 4px;">
          ${gymName} &mdash; Notificación automática
        </p>
        <p style="color:#94a3b8;font-size:11px;margin:0;">
          Si no deseas recibir estos correos, contacta al administrador para desactivar las notificaciones.
        </p>
      </td>
    </tr>`;
}

// ─── SEND EMAIL (transactional) ──────────────────────────────
interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  skipQr?: boolean;
}

async function sendEmail({
  to,
  subject,
  html,
  fromName,
  skipQr,
}: SendEmailParams): Promise<void> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be configured");
  }

  await rateLimit();

  const attachments = await qrAttachment();
  const finalHtml = skipQr ? html : injectSeccionAcceso(html, true);

  const mailOptions = {
    from: `"${fromName || "GymApp"}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html: finalHtml,
    replyTo: process.env.GMAIL_USER,
    attachments,
  };

  await enviarConReintento(mailOptions);
}

// ─── SEND NOTIFICATION (batch/Marketing headers) ─────────────
/**
 * Modo de acceso al sistema por campaña:
 * - `header`: caja con QR inyectada tras el header (por defecto)
 * - `embebido`: el template dibuja su propia caja QR (adjunto incluido, sin inyección)
 * - `enlace`: caja con el enlace pero sin QR (evita el peso de la imagen)
 * - `ninguno`: el template trae su propio botón de acceso
 */
type ModoAcceso = "header" | "embebido" | "enlace" | "ninguno";

const MODO_ACCESO = new Map<string, ModoAcceso>([
  ["estatus-sistema", "enlace"],
  ["deudas-pendientes", "embebido"],
  ["recordatorio-pago", "embebido"],
  ["resumen-dueno", "ninguno"],
]);

function modoAcceso(campaign: string): ModoAcceso {
  return MODO_ACCESO.get(campaign) || "header";
}

/** El QR adjunto solo se genera para las campañas que lo muestran. */
export function incluirQrAdjunto(campaign: string): boolean {
  const modo = modoAcceso(campaign);
  return modo === "header" || modo === "embebido";
}

/** Inserta la sección de acceso tras el header (QR o enlace, según la campaña). */
export function aplicarSeccionAcceso(html: string, campaign: string): string {
  const modo = modoAcceso(campaign);
  if (modo === "header") return injectSeccionAcceso(html, true);
  if (modo === "enlace") return injectSeccionAcceso(html, false);
  return html;
}

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

  const attachments = incluirQrAdjunto(campaign) ? await qrAttachment() : [];
  const finalHtml = aplicarSeccionAcceso(html, campaign);

  const mailOptions = {
    from: `"${fromName || "GymApp"}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html: finalHtml,
    replyTo: process.env.GMAIL_USER,
    attachments,
    headers: {
      "List-Unsubscribe": `<mailto:${process.env.GMAIL_USER}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "Precedence": "bulk",
      "X-Campaign": campaign,
      "X-Mailer": "GymApp-Notifications",
    },
  };

  await enviarConReintento(mailOptions);
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
    html: resetPasswordTemplate(resetLink, gymName, gymLogo) + sharedFooter(gymName),
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
  confirmLink?: string,
  isOAuth?: boolean,
  address?: string
): Promise<void> {
  const baseHtml = welcomeTemplate(email, password, gymName, gymLogo, confirmLink, isOAuth);
  await sendEmail({
    to,
    subject: `${gymName} - Bienvenido`,
    html: baseHtml + sharedFooter(gymName, address),
    fromName: gymName,
    skipQr: true,
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
  address?: string | null
): Promise<void> {
  const baseHtml = deudasPendientesTemplate(memberName, gymName, deudas, totalDeuda, gymLogo);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Pago pendiente de ${memberName}`,
    html: baseHtml + unsubscribeFooter(gymName, address),
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
  address?: string | null
): Promise<void> {
  const baseHtml = recordatorioMiembroTemplate(memberName, gymName, diasRestantes, fechaVencimiento, gymLogo);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Tu membresía vence en ${diasRestantes} día${diasRestantes !== 1 ? "s" : ""}`,
    html: baseHtml + unsubscribeFooter(gymName, address),
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
  address?: string | null
): Promise<void> {
  const baseHtml = recordatorioAdminTemplate(adminName, gymName, miembrosProximoVencer, gymLogo);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Miembros con membresía por vencer`,
    html: baseHtml + unsubscribeFooter(gymName, address),
    fromName: gymName,
    campaign: "recordatorio-admin",
  });
}

// ─── ADMIN SUMMARY ───────────────────────────────────────────
export async function sendAdminSummaryEmail(
  to: string,
  gymName: string,
  resumen: ResumenDueno,
  appUrl: string,
  gymLogo?: string | null,
  address?: string | null,
  frecuencia?: string
): Promise<void> {
  const baseHtml = resumenDuenoTemplate(gymName, resumen, appUrl, gymLogo, frecuencia);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Resumen ${frecuencia?.toLowerCase() || "mensual"} de pagos`,
    html: baseHtml + unsubscribeFooter(gymName, address),
    fromName: gymName,
    campaign: "resumen-dueno",
  });
}

// ─── SYSTEM STATUS ───────────────────────────────────────────
export async function sendSystemStatusEmail(
  to: string,
  gymName: string,
  metricas: EstatusSistema,
  gymLogo?: string | null,
  address?: string | null,
  erroresRecientes?: Array<{ tipo: string; fecha: string; detalle: string }>
): Promise<void> {
  const baseHtml = estatusSistemaTemplate(gymName, metricas, gymLogo, erroresRecientes);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Estado del sistema`,
    html: baseHtml + unsubscribeFooter(gymName, address),
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
  address?: string | null
): Promise<void> {
  const baseHtml = diagnosticoTemplate(resultados, gymName, gymLogo);
  await sendNotificationEmail({
    to,
    subject: `${gymName} - Diagnóstico del sistema`,
    html: baseHtml + unsubscribeFooter(gymName, address),
    fromName: gymName,
    campaign: "diagnostico",
  });
}

// ─── RUN REPORT (texto plano) ────────────────────────────────
/**
 * Reporte de corrida del cron hacia el super admin técnico: **texto plano**
 * (sin HTML, sin QR, sin adjuntos, sin cabeceras bulk) — es correo interno,
 * no una notificación a los miembros.
 */
export async function sendRunReportEmail(
  to: string,
  subject: string,
  text: string
): Promise<void> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be configured");
  }

  await rateLimit();

  const mailOptions: SendMailOptions = {
    from: `"${process.env.GMAIL_USER}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    replyTo: process.env.GMAIL_USER,
  };

  await enviarConReintento(mailOptions);
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
    subject: `Pago aprobado - ${gymName}`,
    html: html + sharedFooter(gymName),
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
    subject: `Pago rechazado - ${gymName}`,
    html: html + sharedFooter(gymName),
    fromName: gymName,
  });
}

export { sleep };
