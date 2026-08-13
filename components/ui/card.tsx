import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-gym-surface border border-gym-border rounded-2xl",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("p-6 border-b border-gym-border", className)}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

const CardContent = forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardTitle = forwardRef<HTMLHeadingElement, CardProps>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-lg font-semibold text-gym-text", className)}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

export { Card, CardHeader, CardContent, CardTitle };
