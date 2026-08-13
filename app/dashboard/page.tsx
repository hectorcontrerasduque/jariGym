"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { formatCurrency, getMonthName, formatDateTime } from "@/lib/utils";
import {
  Users,
  CreditCard,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertTriangle,
  UserCheck,
  Gift,
  Calendar,
} from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [pagosRecientes, setPagosRecientes] = useState<any[]>([]);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [anioSeleccionado]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, pagosData, aniosData] = await Promise.all([
        pagosService.stats(anioSeleccionado),
        pagosService.listarPagos(undefined, anioSeleccionado),
        pagosService.aniosConPagos(),
      ]);
      setStats(statsData);
      setPagosRecientes(pagosData.slice(0, 5));
      setAnios(aniosData);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn relative">
      {/* Neon background orbs */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-gym-primary/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-gym-secondary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Dashboard</h1>
          <p className="text-gym-muted text-sm">Resumen general del gym</p>
        </div>
        <select
          value={anioSeleccionado}
          onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
          className="px-4 py-2 bg-gym-surface border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary"
        >
          {anios.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 relative z-10">
        {/* Inscritos */}
        <Card className="neon-card hover:border-gym-primary/50 transition-all hover:shadow-[0_0_20px_rgba(56,189,248,0.15)]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gym-primary/20 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-gym-primary" />
              </div>
              <div>
                <p className="text-xs text-gym-muted">Inscritos</p>
                <p className="text-xl font-bold text-gym-text neon-text">{stats?.totalMiembros || 0}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              <span className="text-gym-success flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {stats?.inscritosPagados || 0} pagados
              </span>
              <span className="text-gym-warning flex items-center gap-1">
                <Clock className="w-3 h-3" /> {stats?.inscritosPendientes || 0} pendientes
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Mensualidad - Deudores */}
        <Card className="neon-card hover:border-gym-danger/50 transition-all hover:shadow-[0_0_20px_rgba(251,113,133,0.15)]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gym-danger/20 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-gym-danger" />
              </div>
              <div>
                <p className="text-xs text-gym-muted">Deudores</p>
                <p className="text-xl font-bold text-gym-danger neon-text-danger">{stats?.deudoresMensualidad || 0}</p>
              </div>
            </div>
            <div className="mt-3 text-xs text-gym-muted">
              {formatCurrency(stats?.montoDeuda || 0)} en deuda
            </div>
          </CardContent>
        </Card>

        {/* Al día */}
        <Card className="neon-card hover:border-gym-success/50 transition-all hover:shadow-[0_0_20px_rgba(52,211,153,0.15)]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gym-success/20 rounded-xl flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-gym-success" />
              </div>
              <div>
                <p className="text-xs text-gym-muted">Al día</p>
                <p className="text-xl font-bold text-gym-success neon-text-success">{stats?.alDiaMensualidad || 0}</p>
              </div>
            </div>
            <div className="mt-3 text-xs text-gym-muted">
              {formatCurrency(stats?.montoPagado || 0)} cobrado
            </div>
          </CardContent>
        </Card>

        {/* Membresía Libre */}
        <Card className="neon-card hover:border-gym-secondary/50 transition-all hover:shadow-[0_0_20px_rgba(129,140,248,0.15)]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gym-secondary/20 rounded-xl flex items-center justify-center">
                <Gift className="w-5 h-5 text-gym-secondary" />
              </div>
              <div>
                <p className="text-xs text-gym-muted">Membresía Libre</p>
                <p className="text-xl font-bold text-gym-secondary neon-text-secondary">{stats?.membresiaLibre || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pagos recientes */}
      <Card className="neon-card relative z-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gym-primary" />
            Pagos Recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pagosRecientes.length === 0 ? (
            <p className="text-center text-gym-muted py-8">No hay pagos registrados aún</p>
          ) : (
            <div className="space-y-3">
              {pagosRecientes.map((pago) => (
                <div key={pago.id} className="flex items-center justify-between p-3 bg-gym-bg rounded-xl hover:bg-gym-surface transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-gym-surface rounded-full flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-4 h-4 text-gym-muted" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gym-text text-sm truncate">
                        {pago.profile?.nombre_completo || "Desconocido"}
                      </p>
                      <p className="text-xs text-gym-muted">
                        {getMonthName(pago.mes_pagar)} {pago.anio_pagar} • {pago.metodo_pago}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="font-semibold text-gym-text text-sm">{formatCurrency(pago.monto)}</p>
                    <Badge variant={pago.estado === "aprobado" ? "success" : pago.estado === "rechazado" ? "danger" : "warning"}>
                      {pago.estado === "aprobado" ? "✓" : pago.estado === "rechazado" ? "✗" : "…"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
