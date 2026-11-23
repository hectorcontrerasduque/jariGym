"use client";

import { ToastContainer } from "@/components/ui/toast";
import { ConfirmContainer } from "@/components/ui/confirm";
import { ProfileProvider } from "@/components/profile-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <ToastContainer />
      <ConfirmContainer />
      {children}
    </ProfileProvider>
  );
}
