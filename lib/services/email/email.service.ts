import nodemailer from "nodemailer";
import { resetPasswordTemplate } from "./templates/reset-password";

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

async function sendEmail({ to, subject, html, fromName }: SendEmailParams): Promise<void> {
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
