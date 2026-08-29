"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, ReactNode, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  suffix?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, suffix, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-gym-muted">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            className={cn(
              "w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl",
              "text-gym-text placeholder:text-gym-muted",
              "focus:outline-none focus:ring-2 focus:ring-gym-primary focus:border-transparent",
              "transition-all duration-200",
              error && "border-gym-danger focus:ring-gym-danger",
              suffix && "pr-10",
              className
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
              {suffix}
            </span>
          )}
        </div>
        {error && <p className="text-sm text-gym-danger">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
export { Input };
