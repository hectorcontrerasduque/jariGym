"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { formatCurrency, getMonthName } from "@/lib/utils";
import type { Pago } from "@/lib/types";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import {
  Users,
  CreditCard,
  CheckCircle,
  Clock,
  AlertTriangle,
  UserCheck,
  Gift,
  BarChart3,
  FileText,
  Calendar,
} from "lucide-react";

interface MonthlyStat {
  mes: number;
  anio: number;
  nombre: string;
  pagados: number;
  pendientes: number;
  sinPago: number;
  libres: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [pagosRecientes, setPagosRecientes] = useState<any[]>([]);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [monthlyStats, setMonthlyStats] = useState<{ totalMiembros: number; libres: number; meses: MonthlyStat[] } | null>(null);
  const [showAllMonths, setShowAllMonths] = useState(false);

  useEffect(() => {
    loadData();
  }, [anioSeleccionado]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsResult, pagosResult, aniosResult, monthlyResult] = await Promise.allSettled([
        pagosService.stats(anioSeleccionado),
        pagosService.pagosRecientesAprobados(),
        pagosService.aniosConPagos(),
        pagosService.monthlyStats(anioSeleccionado),
      ]);
      if (statsResult.status === "fulfilled") setStats(statsResult.value);
      if (pagosResult.status === "fulfilled") setPagosRecientes(pagosResult.value.slice(0, 5));
      if (aniosResult.status === "fulfilled") setAnios(aniosResult.value);
      if (monthlyResult.status === "fulfilled") setMonthlyStats(monthlyResult.value);
    } catch (error) {
      showToast(messages.toast.errorCargaDatos, "error");
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

  const maxMiembros = monthlyStats ? Math.max(...monthlyStats.meses.map(m => m.pagados + m.sinPago + m.libres), 1) : 1;

  return (
    <div className="space-y-6 animate-fadeIn relative">
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
        {/* Inscritos - miembros activos que pagaron + pendientes */}
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

        {/* Deudores - meses no pagados por miembros activos */}
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

        {/* Al día - sumatoria pagos aceptados en mes actual + inscripción pagada */}
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

      {/* Bar Chart */}
      {monthlyStats && (
        <Card className="neon-card relative z-10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gym-primary" />
              Pagos por Mes - {anioSeleccionado}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(showAllMonths ? [...monthlyStats.meses].reverse() : [...monthlyStats.meses].reverse().slice(0, 3)).map((m) => {
                const total = m.pagados + m.sinPago + m.libres;
                const pagadosWidth = total > 0 ? (m.pagados / maxMiembros) * 100 : 0;
                const sinPagoWidth = total > 0 ? (m.sinPago / maxMiembros) * 100 : 0;
                const libresWidth = total > 0 ? (m.libres / maxMiembros) * 100 : 0;

                return (
                  <div key={`${m.anio}-${m.mes}`} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gym-text">{m.nombre} {m.anio}</span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-sm bg-gym-success" />
                          {m.pagados} pagados
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-sm bg-gym-danger" />
                          {m.sinPago} sin pago
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-sm bg-gym-secondary" />
                          {m.libres} libres
                        </span>
                      </div>
                    </div>
                    <div className="h-6 bg-gym-bg rounded-lg overflow-hidden flex">
                      {pagadosWidth > 0 && (
                        <div
                          className="h-full bg-gym-success transition-all duration-500"
                          style={{ width: `${pagadosWidth}%` }}
                        />
                      )}
                      {sinPagoWidth > 0 && (
                        <div
                          className="h-full bg-gym-danger transition-all duration-500"
                          style={{ width: `${sinPagoWidth}%` }}
                        />
                      )}
                      {libresWidth > 0 && (
                        <div
                          className="h-full bg-gym-secondary transition-all duration-500"
                          style={{ width: `${libresWidth}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-gym-muted">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-gym-success" />
                Pagado
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-gym-danger" />
                Sin pago
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-gym-secondary" />
                Membresía Libre
              </span>
            </div>
            {monthlyStats.meses.length > 3 && (
              <div className="text-center mt-3">
                <button
                  onClick={() => setShowAllMonths(!showAllMonths)}
                  className="text-sm text-gym-primary hover:text-gym-primary/80 transition-colors font-medium"
                >
                  {showAllMonths ? "Ver menos" : `Ver todos los meses (${monthlyStats.meses.length})`}
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagos recientes - solo aprobados */}
      <Card className="neon-card relative z-10">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gym-primary" />
            Pagos Recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pagosRecientes.length === 0 ? (
            <p className="text-center text-gym-muted py-8">{messages.dashboard.noPagosRegistrados}</p>
          ) : (
            <div className="space-y-3">
              {pagosRecientes.map((pago: Pago) => {
                const isInscripcion = pago.notas?.toLowerCase().includes("inscripción") || pago.notas?.toLowerCase().includes("inscripcion");
                return (
                  <div key={pago.id} className="flex items-center justify-between p-3 bg-gym-bg rounded-xl hover:bg-gym-surface transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-gym-surface rounded-full flex items-center justify-center flex-shrink-0">
                        {isInscripcion ? (
                          <FileText className="w-4 h-4 text-gym-primary" />
                        ) : (
                          <Calendar className="w-4 h-4 text-gym-secondary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gym-text text-sm truncate">
                          {pago.profile?.nombre_completo || "Desconocido"}
                        </p>
                        <p className="text-xs text-gym-muted">
                          {isInscripcion ? "Inscripción" : `${getMonthName(pago.mes_pagar)} ${pago.anio_pagar}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <p className="font-semibold text-gym-text text-sm">{formatCurrency(pago.monto)}</p>
                      <Badge variant="success">
                        <CheckCircle className="w-3 h-3 mr-1" /> ✓
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
