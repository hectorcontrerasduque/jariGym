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
}

async function sendEmail({ to, subject, html }: SendEmailParams): Promise<void> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be configured");
  }

  await transporter.sendMail({
    from: `"${process.env.GMAIL_USER}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  gymName: string
): Promise<void> {
  await sendEmail({
    to,
    subject: `${gymName} - Restablecer Contraseña`,
    html: resetPasswordTemplate(resetLink, gymName),
  });
}
