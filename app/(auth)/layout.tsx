import { Providers } from "@/components/providers";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gym-bg via-gym-surface to-gym-bg p-4">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </Providers>
  );
}
