"use client";

import { Suspense } from "react";
import { BusinessCard } from "@/components/business-card";

export default function HomePage() {
  return (
    <Suspense>
      <BusinessCard />
    </Suspense>
  );
}
