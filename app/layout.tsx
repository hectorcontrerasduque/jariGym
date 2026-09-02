import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "hcontrer.org — Sistemas a la Medida",
  description: "Desarrollo de páginas web, aplicaciones móviles, sistemas de facturación, contabilidad, nómina y más. Soluciones tecnológicas a la medida.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "hcontrer.org — Sistemas a la Medida",
    description: "Desarrollo de páginas web, aplicaciones móviles, sistemas de facturación, contabilidad, nómina y más.",
    url: "https://hcontrer.org",
    siteName: "hcontrer.org",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen bg-gym-bg text-gym-text font-sans antialiased">{children}</body>
    </html>
  );
}
