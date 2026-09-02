import { Sidebar } from "@/components/sidebar";
import { Providers } from "@/components/providers";
import { ScrollToTop } from "@/components/scroll-to-top";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <ScrollToTop />
      <div className="min-h-screen bg-gym-bg flex flex-col">
        <Sidebar />
        <main className="md:ml-64 pt-16 md:pt-0 p-4 md:p-8 pb-24 md:pb-8 flex-1">
          {children}
        </main>
      </div>
    </Providers>
  );
}
