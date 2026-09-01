"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  overlayClassName?: string;
}

export function Modal({ isOpen, onClose, title, children, className, overlayClassName }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none",
        overlayClassName
      )}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={contentRef}
        className={cn(
          "bg-gym-surface border border-gym-border rounded-2xl w-full max-w-md mx-4 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto",
          "animate-in fade-in zoom-in-95 duration-200",
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gym-border bg-gym-surface sticky top-0 z-10">
            <h2 className="text-lg font-semibold text-gym-text">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 text-gym-muted hover:text-gym-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
