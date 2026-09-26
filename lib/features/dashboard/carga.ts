import { PagosService } from "@/lib/features/pagos/service";
import type { ElegiblesInput } from "@/lib/features/pagos/domain/elegibles";
import type { ElegiblesResult, PagoRPCRow } from "@/lib/features/pagos/domain/types";
import type { GymConfig, Profile } from "@/lib/types";

type SupabaseLike = ConstructorParameters<typeof PagosService>[0] & object;

export interface PerfilDashboard {
  role: string;
  arrival_time: string | null;
  departure_time: string | null;
  full_name: string;
  email: string | null;
}

/**
 * Raw data for the first dashboard render. Deliberately NOT computed: every
 * date-dependent figure is derived in the browser with the user's local time
 * (the server runs in UTC).
 */
export interface DashboardRaw {
  anio: number;
  user: { id: string; email: string | null };
  profile: PerfilDashboard | null;
  elegiblesInput: ElegiblesInput;
  pagosDelAnio: PagoRPCRow[];
  pagosRecientes: Awaited<ReturnType<PagosService["pagosRecientesAprobados"]>>;
  anios: number[];
  gymConfig: GymConfig | null;
  /** Own pending payments; only fetched for non-super_admin users, null otherwise. */
  misPagosPendientes: number | null;
}

/**
 * Runs every dashboard query with the given (user-session) client, in parallel.
 * Resolves to null when there is no session or anything fails — never rejects —
 * so the page can fall back to the browser-side load with its usual error handling.
 */
export async function consultarDashboard(supabase: SupabaseLike, anio: number): Promise<DashboardRaw | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const service = new PagosService(supabase);
    const [profileResult, elegiblesInput, pagosDelAnio, pagosRecientes, anios, configResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("role, arrival_time, departure_time, full_name, email")
        .eq("id", user.id)
        .single(),
      service.consultarElegibles(),
      service.pagosDelAnio(anio),
      service.pagosRecientesAprobados(anio),
      service.aniosConPagos(),
      supabase.from("gym_config").select("*").limit(1).maybeSingle(),
    ]);

    const profile = (profileResult.data as PerfilDashboard | null) ?? null;

    let misPagosPendientes: number | null = null;
    if (profile?.role !== "super_admin") {
      const { data: misPagos } = await supabase
        .from("payments")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "pendiente");
      misPagosPendientes = misPagos?.length || 0;
    }

    return {
      anio,
      user: { id: user.id, email: user.email ?? null },
      profile,
      elegiblesInput,
      pagosDelAnio,
      pagosRecientes,
      anios,
      gymConfig: (configResult.data as GymConfig | null) ?? null,
      misPagosPendientes,
    };
  } catch {
    return null;
  }
}

/** Members list shown by the dashboard (hour distribution, names in recent payments). */
export function mapearMiembros(elegibles: ElegiblesResult): Profile[] {
  return elegibles.miembros.map((m) => ({
    id: m.id,
    email: m.email,
    full_name: m.full_name || "",
    avatar_url: m.avatar_url,
    activo: m.activo,
    role: (m.role as "super_admin" | "miembro") || "miembro",
    start_date: m.start_date || "",
    inscription_admin_note: m.inscription_admin_note,
    inscription_paid: m.inscription_paid,
    arrival_time: m.arrival_time,
    departure_time: m.departure_time,
  })) as Profile[];
}
