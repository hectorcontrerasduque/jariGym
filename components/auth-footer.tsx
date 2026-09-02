"use client";

import Link from "next/link";

export function AuthFooter() {
  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 text-center text-xs text-gym-muted z-10">
      &copy; {new Date().getFullYear()} Derechos reservados{" "}
      <Link
        href="/"
        className="text-gym-primary hover:underline"
      >
        hcontrer.org
      </Link>
    </div>
  );
}
