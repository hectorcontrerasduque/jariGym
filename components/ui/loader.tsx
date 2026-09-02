"use client";

import { Zap } from "lucide-react";

interface LoaderProps {
  show: boolean;
  message?: string;
  variant?: "page" | "overlay";
}

function LoaderContent({ message = "Cargando..." }: { message: string }) {
  return (
    <div className="text-center">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gym-primary/30 to-gym-secondary/20 flex items-center justify-center mx-auto animate-pulse-glow">
          <Zap className="w-8 h-8 text-gym-primary" />
        </div>
      </div>
      <div className="animate-spin w-10 h-10 border-2 border-gym-primary border-t-transparent rounded-full mx-auto" />
      <p className="text-gym-muted text-sm mt-4">{message}</p>
    </div>
  );
}

export function Loader({ show, message = "Cargando...", variant = "page" }: LoaderProps) {
  if (!show) return null;

  if (variant === "overlay") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <LoaderContent message={message} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] relative z-10">
      <LoaderContent message={message} />
    </div>
  );
}
