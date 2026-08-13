"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-gym-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl",
            "text-gym-text placeholder:text-gym-muted",
            "focus:outline-none focus:ring-2 focus:ring-gym-primary focus:border-transparent",
            "transition-all duration-200",
            error && "border-gym-danger focus:ring-gym-danger",
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-gym-danger">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
export { Input };
