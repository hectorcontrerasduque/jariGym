"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { User } from "lucide-react";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({ src, alt = "", size = "md", className }: AvatarProps) {
  const supabase = createClient();

  const imageUrl =
    src && src.startsWith("avatars/")
      ? supabase.storage.from("avatars").getPublicUrl(src).data.publicUrl
      : src;

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-16 h-16",
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-8 h-8",
  };

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-full bg-gym-surface border border-gym-border overflow-hidden",
        // eslint-disable-next-line security/detect-object-injection
        sizeClasses[size],
        className
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        // eslint-disable-next-line security/detect-object-injection
        <User className={cn("text-gym-muted", iconSizes[size])} />
      )}
    </div>
  );
}
