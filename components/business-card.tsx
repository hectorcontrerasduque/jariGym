"use client";

import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  Globe,
  Smartphone,
  Calculator,
  Receipt,
  CreditCard,
  Briefcase,
  X,
} from "lucide-react";

const WHATSAPP_URL = "https://wa.me/584263213792";
const PHONE = "+58 426-321-3792";
const DOMAIN = "hcontrer.org";

const services = [
  { icon: Globe, label: "Páginas Web", color: "text-gym-primary" },
  { icon: Smartphone, label: "Apps Móviles", color: "text-gym-secondary" },
  { icon: Calculator, label: "Contabilidad / Nómina", color: "text-gym-success" },
  { icon: Receipt, label: "Facturación / CxC", color: "text-gym-warning" },
  { icon: CreditCard, label: "Sistema de Pagos", color: "text-gym-primary" },
  { icon: Briefcase, label: "Sistemas a la Medida", color: "text-gym-secondary" },
];

export function BusinessCard() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 via-transparent to-gym-secondary/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gym-primary/8 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gym-secondary/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="animate-neon-pulse rounded-3xl bg-gym-surface/95 backdrop-blur-xl border border-gym-primary/20 w-full max-w-md mx-auto relative z-10 overflow-hidden">
        <button
          onClick={() => router.push("/login")}
          className="absolute top-4 right-4 p-2 text-gym-muted hover:text-gym-text transition-colors rounded-full hover:bg-gym-bg/50 z-20"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 text-center">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-gym-primary/20 to-gym-secondary/20 border border-gym-primary/30 flex items-center justify-center mb-5 animate-pulse-glow">
            <span className="text-2xl font-bold font-display neon-text">HC</span>
          </div>

          <h1 className="text-2xl font-bold font-display neon-text mb-1">{DOMAIN}</h1>
          <p className="text-gym-muted text-sm">Sistemas a la Medida</p>

          <div className="grid grid-cols-2 gap-3 mt-8">
            {services.map((s) => (
              <div key={s.label} className="flex items-center gap-2 bg-gym-bg/50 rounded-xl p-3 border border-gym-border/50">
                <s.icon className={`w-4 h-4 ${s.color} flex-shrink-0`} />
                <span className="text-xs text-gym-text">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center">
            <div className="bg-white p-3 rounded-2xl mb-3">
              <QRCodeSVG
                value={WHATSAPP_URL}
                size={140}
                bgColor="#ffffff"
                fgColor="#0B1120"
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-xs text-gym-muted">Escanéame en WhatsApp</p>
          </div>

          <div className="mt-6 space-y-2 text-sm text-gym-muted">
            <a href={`tel:${PHONE.replace(/\s/g, "")}`} className="flex items-center justify-center gap-2 hover:text-gym-primary transition-colors">
              <span>📞</span>
              <span>{PHONE}</span>
            </a>
            <a href={`https://${DOMAIN}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 hover:text-gym-primary transition-colors">
              <span>🌐</span>
              <span>{DOMAIN}</span>
            </a>
          </div>

          <button
            onClick={() => router.push("/login")}
            className="mt-6 w-full py-3 rounded-xl bg-gym-primary/10 border border-gym-primary/30 text-gym-primary text-sm font-medium hover:bg-gym-primary/20 transition-all"
          >
            Acceder al Sistema
          </button>
        </div>
      </div>
    </div>
  );
}
