"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gym-bg",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          {
            "bg-gym-primary text-gym-bg hover:bg-gym-primary/90 focus:ring-gym-primary": variant === "primary",
            "bg-gym-surface text-gym-text border border-gym-border hover:bg-gym-border focus:ring-gym-border": variant === "secondary",
            "bg-gym-danger text-white hover:bg-gym-danger/90 focus:ring-gym-danger": variant === "danger",
            "text-gym-muted hover:text-gym-text hover:bg-gym-surface focus:ring-gym-border": variant === "ghost",
          },
          {
            "px-3 py-1.5 text-sm": size === "sm",
            "px-4 py-2 text-sm": size === "md",
            "px-6 py-3 text-base": size === "lg",
          },
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
export { Button };
