import { Sidebar } from "@/components/sidebar";
import { Providers } from "@/components/providers";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="min-h-screen bg-gym-bg flex flex-col">
        <Sidebar />
        <main className="md:ml-64 pt-16 md:pt-0 p-4 md:p-8 pb-24 md:pb-8 flex-1">
          {children}
        </main>
        <footer className="md:ml-64 border-t border-gym-border/50 bg-gym-surface/50 backdrop-blur-sm">
          <div className="p-4 text-center text-xs text-gym-muted">
            &copy; {new Date().getFullYear()} Derechos reservados <a href="https://hcontrer.org" target="_blank" rel="noopener noreferrer" className="text-gym-primary hover:underline">hcontrer.org</a>
          </div>
        </footer>
      </div>
    </Providers>
  );
}
