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
    <div className="h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gym-primary/5 via-transparent to-gym-secondary/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gym-primary/8 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gym-secondary/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="animate-neon-pulse rounded-3xl bg-gym-surface/95 backdrop-blur-xl border border-gym-primary/20 w-full max-w-sm mx-auto relative z-10 overflow-hidden">
        <button
          onClick={() => router.push("/login")}
          className="absolute top-3 right-3 p-1.5 text-gym-muted hover:text-gym-text transition-colors rounded-full hover:bg-gym-bg/50 z-20"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-5 text-center">
          <div className="mx-auto w-14 h-14 rounded-xl bg-gradient-to-br from-gym-primary/20 to-gym-secondary/20 border border-gym-primary/30 flex items-center justify-center mb-3 animate-pulse-glow">
            <span className="text-xl font-bold font-display neon-text">HC</span>
          </div>

          <h1 className="text-xl font-bold font-display neon-text mb-0.5">{DOMAIN}</h1>
          <p className="text-gym-muted text-xs">Sistemas a la Medida</p>

          <div className="grid grid-cols-2 gap-2 mt-5">
            {services.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 bg-gym-bg/50 rounded-lg p-2 border border-gym-border/50">
                <s.icon className={`w-3.5 h-3.5 ${s.color} flex-shrink-0`} />
                <span className="text-[11px] text-gym-text leading-tight">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-col items-center">
            <div className="bg-white p-2 rounded-xl mb-2">
              <QRCodeSVG
                value={WHATSAPP_URL}
                size={110}
                bgColor="#ffffff"
                fgColor="#0B1120"
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-[10px] text-gym-muted">Escanéame en WhatsApp</p>
          </div>

          <div className="mt-4 space-y-1 text-xs text-gym-muted">
            <a href={`tel:${PHONE.replace(/\s/g, "")}`} className="flex items-center justify-center gap-1.5 hover:text-gym-primary transition-colors">
              <span>📞</span>
              <span>{PHONE}</span>
            </a>
          </div>

          <button
            onClick={() => router.push("/login")}
            className="mt-4 w-full py-2.5 rounded-xl bg-gym-primary/10 border border-gym-primary/30 text-gym-primary text-xs font-medium hover:bg-gym-primary/20 transition-all"
          >
            Acceder al Sistema
          </button>
        </div>
      </div>
    </div>
  );
}
