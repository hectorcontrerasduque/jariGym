import { createClient } from "@/lib/supabase/server";
import { consultarDashboard } from "@/lib/features/dashboard/carga";
import { DashboardClient } from "./dashboard-client";

/**
 * Server Component: starts every dashboard query on the server with the user's
 * session (cookies + anon key → same RLS as the browser; never the service role)
 * and hands the pending promise to the client UI. Not awaited, so the HTML with the
 * loader goes out immediately and the data streams in the same response.
 * The client derives every date-dependent figure with the browser's local time.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const datosIniciales = consultarDashboard(supabase, new Date().getFullYear());
  return <DashboardClient datosIniciales={datosIniciales} />;
}
