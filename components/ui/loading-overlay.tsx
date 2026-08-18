"use client";

import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  show: boolean;
  message?: string;
}

export function LoadingOverlay({ show, message = "Procesando..." }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 p-8 bg-gym-surface/90 rounded-2xl border border-gym-border/50 shadow-2xl">
        <div className="relative">
          <Loader2 className="w-12 h-12 text-gym-primary animate-spin" />
          <div className="absolute inset-0 w-12 h-12 border-2 border-gym-primary/20 rounded-full" />
        </div>
        <p className="text-sm font-medium text-gym-text">{message}</p>
      </div>
    </div>
  );
}
