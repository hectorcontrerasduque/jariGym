import { Sidebar } from "@/components/sidebar";
import { Providers } from "@/components/providers";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="min-h-screen bg-gym-bg">
        <Sidebar />
        <main className="md:ml-64 pt-16 md:pt-0 p-4 md:p-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>
    </Providers>
  );
}
