"use client";

import { ToastContainer } from "@/components/ui/toast";
import { ProfileProvider } from "@/components/profile-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <ToastContainer />
      {children}
    </ProfileProvider>
  );
}
