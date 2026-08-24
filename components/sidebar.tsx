"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { configService } from "@/lib/services/config/config.service";
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Settings,
  LogOut,
  Dumbbell,
  Bell,
  User,
} from "lucide-react";
import type { Profile } from "@/lib/types";

const adminNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/pagos", label: "Pagos", icon: CreditCard },
  { href: "/dashboard/miembros", label: "Miembros", icon: Users },
  { href: "/dashboard/configuracion", label: "Config", icon: Settings },
];

const adminNavItemsConNotificaciones = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/pagos", label: "Pagos", icon: CreditCard },
  { href: "/dashboard/miembros", label: "Miembros", icon: Users },
  { href: "/dashboard/configuracion/notificaciones", label: "Notificaciones", icon: Bell },
  { href: "/dashboard/configuracion", label: "Config", icon: Settings },
];

const miembroNavItems = [
  { href: "/dashboard/mis-pagos", label: "Mis Pagos", icon: CreditCard },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gymName, setGymName] = useState("GymApp");
  const [gymLogo, setGymLogo] = useState("");
  const [hasConfig, setHasConfig] = useState<boolean | null>(null);
  const [notificacionesEnabled, setNotificacionesEnabled] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const getProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(data);

        if (data && data.role !== "super_admin" && data.role !== "admin") {
          const allowed = ["/dashboard/mis-pagos", "/dashboard/reportar-pago", "/dashboard/perfil"];
          if (!allowed.some((p) => pathname.startsWith(p))) {
            router.replace("/dashboard/mis-pagos");
          }
        }
      }
    };
    const getGymConfig = async () => {
      try {
        const config = await configService.getConfig();
        if (config) {
          setHasConfig(true);
          if (config.nombre_gym) setGymName(config.nombre_gym);
          if (config.logo_url) setGymLogo(config.logo_url);
          setNotificacionesEnabled(config.notificaciones_enabled || false);
        } else {
          setHasConfig(false);
        }
      } catch {
        // Non-critical: silent - fallback to no config
        setHasConfig(false);
      }
    };
    getProfile();
    getGymConfig();

    const handleConfigUpdated = () => getGymConfig();
    window.addEventListener("config:updated", handleConfigUpdated);
    return () => window.removeEventListener("config:updated", handleConfigUpdated);
  }, []);

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    window.location.href = "/login";
  };

  const isAdmin = profile?.role === "super_admin" || profile?.role === "admin";
  const isSuperAdmin = profile?.role === "super_admin";

  const navItems = hasConfig === false
    ? (isSuperAdmin ? [{ href: "/dashboard/configuracion", label: "Config", icon: Settings }] : [])
    : (isAdmin
      ? (notificacionesEnabled ? adminNavItemsConNotificaciones : adminNavItems)
      : miembroNavItems);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-gym-surface/90 backdrop-blur-xl border-b border-gym-border/50 z-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard/perfil">
              <div className={isSuperAdmin ? "neon-admin-ring rounded-full" : ""}>
                <Avatar src={profile?.avatar_url} alt={profile?.nombre_completo || ""} size="sm" />
              </div>
            </Link>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium text-gym-text truncate", isSuperAdmin && "neon-gold")}>
                {profile?.nombre_completo || "Usuario"}
              </p>
              <p className="text-[10px] text-gym-muted truncate">
                {profile?.email || ""}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 text-gym-muted hover:text-gym-danger transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-gym-surface/80 backdrop-blur-xl border-r border-gym-border/50 flex-col z-40">
        <div className="p-6 border-b border-gym-border/50">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden", isSuperAdmin ? "bg-gradient-to-br from-yellow-500/30 to-amber-600/30 shadow-[0_0_15px_rgba(251,191,36,0.3)]" : "bg-gym-primary/20 animate-pulse-glow")}>
              {gymLogo ? (
                <img src={gymLogo} alt={gymName} className="w-full h-full object-cover" />
              ) : (
                <Dumbbell className={cn("w-6 h-6", isSuperAdmin ? "text-yellow-400" : "text-gym-primary")} />
              )}
            </div>
            <div>
              <h1 className={cn("font-display font-bold text-gym-text", isSuperAdmin ? "neon-gold" : "neon-text")}>{gymName}</h1>
              <p className="text-xs text-gym-muted">Gestión inteligente</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/dashboard" && !item.href.endsWith("/configuracion") && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-gym-primary/10 text-gym-primary shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                    : "text-gym-muted hover:text-gym-text hover:bg-gym-bg/50"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gym-border/50">
          <Link
            href="/dashboard/perfil"
            className={cn(
              "flex items-center gap-3 mb-3 w-full text-left hover:bg-gym-bg/50 p-2 rounded-xl transition-colors",
              pathname === "/dashboard/perfil" && "bg-gym-bg/50"
            )}
          >
            <div className={isSuperAdmin ? "neon-admin-ring rounded-full" : ""}>
              <Avatar
                src={profile?.avatar_url}
                alt={profile?.nombre_completo || ""}
                size="sm"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium text-gym-text truncate", isSuperAdmin && "neon-gold")}>
                {profile?.nombre_completo || "Usuario"}
              </p>
              <p className="text-xs text-gym-muted truncate">
                {profile?.email || ""}
              </p>
            </div>
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gym-muted hover:text-gym-danger transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gym-surface/90 backdrop-blur-xl border-t border-gym-border/50 z-50 safe-area-bottom">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/dashboard" && !item.href.endsWith("/configuracion") && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1 py-1 rounded-lg transition-all",
                  isActive
                    ? "text-gym-primary shadow-[0_0_10px_rgba(56,189,248,0.3)]"
                    : "text-gym-muted"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium truncate">{item.label}</span>
              </Link>
            );
          })}
          {!isAdmin && (
            <Link
              href="/dashboard/perfil"
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-1 rounded-lg transition-all",
                pathname === "/dashboard/perfil"
                  ? "text-gym-primary shadow-[0_0_10px_rgba(56,189,248,0.3)]"
                  : "text-gym-muted"
              )}
            >
              <User className="w-5 h-5" />
              <span className="text-[10px] font-medium">Perfil</span>
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
