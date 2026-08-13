import { cn } from "@/lib/utils";

interface BadgeProps {
  variant?: "default" | "success" | "danger" | "warning" | "primary" | "secondary";
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        {
          "bg-gym-surface text-gym-muted": variant === "default",
          "bg-gym-success/20 text-gym-success": variant === "success",
          "bg-gym-danger/20 text-gym-danger": variant === "danger",
          "bg-gym-warning/20 text-gym-warning": variant === "warning",
          "bg-gym-primary/20 text-gym-primary": variant === "primary",
          "bg-gym-secondary/20 text-gym-secondary": variant === "secondary",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
