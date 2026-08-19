"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function PasswordInput({ className, label, error, ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gym-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          className={cn(
            "w-full px-4 py-2.5 pr-10 bg-gym-bg border border-gym-border rounded-xl",
            "text-gym-text placeholder:text-gym-muted",
            "focus:outline-none focus:ring-2 focus:ring-gym-primary focus:border-transparent",
            "transition-all duration-200",
            error && "border-gym-danger focus:ring-gym-danger",
            className
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gym-muted hover:text-gym-text transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-sm text-gym-danger">{error}</p>}
    </div>
  );
}
