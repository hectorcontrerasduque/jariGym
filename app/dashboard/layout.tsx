import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gym-bg">
      <Sidebar />
      <main className="md:ml-64 p-4 md:p-8 pb-24 md:pb-8">
        {children}
      </main>
    </div>
  );
}
