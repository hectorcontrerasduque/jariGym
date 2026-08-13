"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { User } from "lucide-react";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({ src, alt = "", size = "md", className }: AvatarProps) {
  const [imageUrl, setImageUrl] = useState(src);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (src) {
      const supabase = createClient();
      if (src.startsWith("avatars/")) {
        const { data } = supabase.storage.from("avatars").getPublicUrl(src);
        setImageUrl(data.publicUrl);
      } else {
        setImageUrl(src);
      }
      setImgError(false);
    }
  }, [src]);

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
        "relative inline-flex items-center justify-center rounded-full bg-gym-surface border-2 border-gym-primary overflow-hidden",
        sizeClasses[size],
        className
      )}
    >
      {imageUrl && !imgError ? (
        <img
          src={imageUrl}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <User className={cn("text-gym-muted", iconSizes[size])} />
      )}
    </div>
  );
}
