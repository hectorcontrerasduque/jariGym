import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "primary" | "danger" | "success" | "secondary" | "warning";

const BADGE_CLASES: Record<StatTone, string> = {
  primary: "bg-gym-primary/10 border-gym-primary/20 text-gym-primary",
  danger: "bg-gym-danger/10 border-gym-danger/20 text-gym-danger",
  success: "bg-gym-success/10 border-gym-success/20 text-gym-success",
  secondary: "bg-gym-secondary/10 border-gym-secondary/20 text-gym-secondary",
  warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500",
};

const BAR_CLASES: Record<StatTone, string> = {
  primary: "bg-gradient-to-r from-gym-primary to-gym-primary/60",
  danger: "bg-gradient-to-r from-gym-danger to-gym-danger/60",
  success: "bg-gradient-to-r from-gym-success to-gym-success/60",
  secondary: "bg-gradient-to-r from-gym-secondary to-gym-secondary/60",
  warning: "bg-gradient-to-r from-yellow-500 to-yellow-500/60",
};

function badgeClases(tone: StatTone): string {
  switch (tone) {
    case "primary": return BADGE_CLASES.primary;
    case "danger": return BADGE_CLASES.danger;
    case "success": return BADGE_CLASES.success;
    case "secondary": return BADGE_CLASES.secondary;
    case "warning": return BADGE_CLASES.warning;
  }
}

function barClases(tone: StatTone): string {
  switch (tone) {
    case "primary": return BAR_CLASES.primary;
    case "danger": return BAR_CLASES.danger;
    case "success": return BAR_CLASES.success;
    case "secondary": return BAR_CLASES.secondary;
    case "warning": return BAR_CLASES.warning;
  }
}

interface StatCardProps {
  tone: StatTone;
  icon: ReactNode;
  badge: { label: string; icon?: ReactNode };
  title: string;
  value: ReactNode;
  valueClassName?: string;
  subline?: ReactNode;
  onClick?: () => void;
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * Anatomía común de las tarjetas del dashboard:
 * header (icono + badge) → título → número → sub-línea → filas → footer.
 */
export function StatCard({
  tone,
  icon,
  badge,
  title,
  value,
  valueClassName,
  subline,
  onClick,
  footer,
  children,
}: StatCardProps) {
  return (
    <Card
      className={cn("stat-card flex h-full flex-col", onClick && "stat-card-interactive")}
      onClick={onClick}
    >
      <CardContent className="flex flex-1 flex-col p-3 sm:p-5">
        <div className="mb-2 flex items-start justify-between sm:mb-4">
          <div className={cn("stat-icon", `stat-icon-${tone}`)}>{icon}</div>
          <div
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-2 py-1 sm:flex",
              badgeClases(tone)
            )}
          >
            {badge.icon}
            <span className="text-[10px] font-medium">{badge.label}</span>
          </div>
        </div>
        <p className="mb-0.5 text-[10px] uppercase tracking-wider text-gym-muted sm:mb-1 sm:text-xs">
          {title}
        </p>
        <div className={cn("stat-number", valueClassName)}>{value}</div>
        {subline && <p className="text-[9px] text-gym-muted sm:text-[10px]">{subline}</p>}
        {children}
        {footer && <div className="mt-auto pt-2 sm:pt-3">{footer}</div>}
      </CardContent>
    </Card>
  );
}

interface StatRowProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  valueClassName?: string;
}

/** Fila label/valor usada por el desglose por método y por montos secundarios. */
export function StatRow({ label, value, icon, hint, valueClassName = "text-gym-text" }: StatRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px] sm:text-xs">
      <span className="flex min-w-0 items-center gap-1 text-gym-muted">
        {icon}
        <span className="truncate font-medium text-gym-text">{label}</span>
      </span>
      <span className="whitespace-nowrap text-right tabular-nums">
        <span className={cn("font-semibold", valueClassName)}>{value}</span>
        {hint && <span className="block text-[9px] font-normal text-gym-muted">{hint}</span>}
      </span>
    </div>
  );
}

interface StatBarProps {
  percent: number;
  tone: StatTone;
  label?: string;
}

/** Barra de progreso con el porcentaje a la derecha. */
export function StatBar({ percent, tone, label }: StatBarProps) {
  const pct = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="progress-bar flex-1">
        <div className={cn("progress-bar-fill", barClases(tone))} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-gym-muted sm:text-[10px]">
        {label ?? `${Math.round(pct)}%`}
      </span>
    </div>
  );
}
