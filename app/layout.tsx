import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GymApp - Gestión de Gym",
  description: "Sistema de gestión de pagos y miembros para gimnasios",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-gym-bg antialiased">{children}</body>
    </html>
  );
}
