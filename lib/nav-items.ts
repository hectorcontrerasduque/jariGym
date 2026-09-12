import {
  LayoutDashboard,
  CreditCard,
  Users,
  Settings,
  Bell,
  Home,
} from "lucide-react";

export const adminNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/pagos", label: "Pagos", icon: CreditCard },
  { href: "/dashboard/miembros", label: "Miembros", icon: Users },
  { href: "/dashboard/configuracion/notificaciones", label: "Notificaciones", icon: Bell },
  { href: "/dashboard/configuracion", label: "Config", icon: Settings },
];

export const miembroNavItems = [
  { href: "/dashboard/mis-pagos?tab=home", label: "Home", icon: Home },
  { href: "/dashboard/mis-pagos?tab=pagos", label: "Mis Pagos", icon: CreditCard },
];
