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

  const result = await transporter.sendMail({
    from: `"${fromName || "GymApp"} - No Reply" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    replyTo: "no-reply@noreply.com",
  });

  if (!result.messageId) {
    throw new Error("Email sent but no messageId returned");
  }
}

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

export async function sendPaymentDebtEmail(
  to: string,
  memberName: string,
  gymName: string,
  deudas: Array<{ mes: number; anio: number; monto: number }>,
  totalDeuda: number,
  gymLogo?: string | null
): Promise<void> {
  await sendEmail({
    to,
    subject: `${gymName} - Tienes pagos pendientes`,
    html: deudasPendientesTemplate(
      memberName,
      gymName,
      deudas,
      totalDeuda,
      gymLogo
    ),
    fromName: gymName,
  });
}

export async function sendPaymentReminderEmail(
  to: string,
  memberName: string,
  gymName: string,
  diasRestantes: number,
  fechaVencimiento: string,
  gymLogo?: string | null
): Promise<void> {
  await sendEmail({
    to,
    subject: `${gymName} - Tu membresía vence en ${diasRestantes} días`,
    html: recordatorioMiembroTemplate(
      memberName,
      gymName,
      diasRestantes,
      fechaVencimiento,
      gymLogo
    ),
    fromName: gymName,
  });
}

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
  await sendEmail({
    to,
    subject: `${gymName} - Miembros con membresía por vencer`,
    html: recordatorioAdminTemplate(
      adminName,
      gymName,
      miembrosProximoVencer,
      gymLogo
    ),
    fromName: gymName,
  });
}

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
  await sendEmail({
    to,
    subject: `${gymName} - Resumen de pagos`,
    html: resumenDuenoTemplate(gymName, resumen, appUrl, gymLogo),
    fromName: gymName,
  });
}

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
  await sendEmail({
    to,
    subject: `${gymName} - Estado del Sistema`,
    html: estatusSistemaTemplate(gymName, metricas, gymLogo),
    fromName: gymName,
  });
}
