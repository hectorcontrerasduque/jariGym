"use client";

import { Zap } from "lucide-react";

interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message = "Cargando..." }: PageLoaderProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] relative z-10">
      <div className="text-center">
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gym-primary/30 to-gym-secondary/20 flex items-center justify-center mx-auto animate-pulse-glow">
            <Zap className="w-8 h-8 text-gym-primary" />
          </div>
        </div>
        <div className="animate-spin w-10 h-10 border-2 border-gym-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-gym-muted text-sm mt-4">{message}</p>
      </div>
    </div>
  );
}
