"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: "bg-gym-success/15 border-gym-success/40 text-gym-success",
  error: "bg-gym-danger/15 border-gym-danger/40 text-gym-danger",
  warning: "bg-gym-warning/15 border-gym-warning/40 text-gym-warning",
  info: "bg-gym-primary/15 border-gym-primary/40 text-gym-primary",
};

let toastListener: ((toast: Omit<Toast, "id">) => void) | null = null;

const TOAST_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  error: 7000,
  warning: 7000,
};

export function showToast(message: string, type: ToastType = "info") {
  toastListener?.({ message, type });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    toastListener = (toast) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_DURATIONS[toast.type]);
    };
    return () => { toastListener = null; };
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg animate-fadeIn ${styles[toast.type]}`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button onClick={() => dismiss(toast.id)} className="p-1 hover:opacity-70 transition-opacity flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
