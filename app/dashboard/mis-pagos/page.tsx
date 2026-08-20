"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { CreditCard, CheckCircle, Clock, Gift, Calendar, Bell, Trash2, FileText, ArrowRight, Plus } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import Link from "next/link";
import type { Pago, Profile } from "@/lib/types";

interface MembresiaLibre {
  fecha_inicio: string;
  fecha_fin: string | null;
  asignado_por_nombre: string | null;
}

function getPagoLabel(pago: Pago): string {
  const isInscripcion = pago.notas?.toLowerCase().includes("inscripción") || pago.notas?.toLowerCase().includes("inscripcion");
  if (isInscripcion) return "Inscripción";
  return `${getMonthName(pago.mes_pagar)} ${pago.anio_pagar}`;
}

function getPagoIcon(pago: Pago) {
  const isInscripcion = pago.notas?.toLowerCase().includes("inscripción") || pago.notas?.toLowerCase().includes("inscripcion");
  if (isInscripcion) return <FileText className="w-5 h-5 text-gym-primary" />;
  return <Calendar className="w-5 h-5 text-gym-secondary" />;
}

export default function MisPagosPage() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [membresiaLibre, setMembresiaLibre] = useState<MembresiaLibre | null>(null);

  useEffect(() => { loadData(); }, [anioSeleccionado]);

  const loadData = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(profileData);

      const [pagosData, aniosData] = await Promise.all([
        pagosService.listarMisPagos(anioSeleccionado),
        pagosService.aniosConPagos(user.id),
      ]);
      setPagos(pagosData);
      setAnios(aniosData);

      const { data: libreData } = await supabase
        .from("membresias")
        .select("fecha_inicio, fecha_fin, asignado_por_nombre")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (libreData && !libreData.fecha_fin) {
        setMembresiaLibre(libreData as MembresiaLibre);
      }
    } catch (error) {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (pagoId: string) => {
    if (!confirm(messages.pagos.eliminarPagoConfirm)) return;
    setDeleting(pagoId);
    try {
      await pagosService.eliminarPago(pagoId);
      showToast(messages.toast.pagoEliminado, "success");
      await loadData();
    } catch (err: any) {
      showToast(err.message || messages.toast.pagoEliminadoError, "error");
    } finally {
      setDeleting(null);
    }
  };

  const aprobados = pagos.filter((p) => p.estado === "aprobado");
  const pendientes = pagos.filter((p) => p.estado === "pendiente");
  const montoAprobado = aprobados.reduce((sum, p) => sum + (p.monto || 0), 0);
  const montoPendiente = pendientes.reduce((sum, p) => sum + (p.monto || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Mis Pagos</h1>
          <p className="text-gym-muted text-sm">Historial de tus pagos</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/reportar-pago" className="hidden sm:flex">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Reportar Pago
            </Button>
          </Link>
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
      </div>

      {/* Mobile floating button */}
      <Link
        href="/dashboard/reportar-pago"
        className="sm:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gym-primary text-gym-bg shadow-lg shadow-gym-primary/30 flex items-center justify-center active:scale-95 transition-all"
      >
        <Plus className="w-6 h-6" />
      </Link>

      {/* Estado de inscripción y membresía */}
      <div className="grid grid-cols-2 gap-3">
        <Card className={profile?.inscripcion_pagada ? "neon-border-success" : "neon-border-warning"}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              {profile?.inscripcion_pagada ? (
                <CheckCircle className="w-6 h-6 text-gym-success" />
              ) : (
                <Clock className="w-6 h-6 text-gym-warning" />
              )}
              <div>
                <p className="text-xs text-gym-muted">Inscripción</p>
                <p className="text-sm font-semibold text-gym-text">
                  {profile?.inscripcion_pagada ? "Pagada" : "Pendiente"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={membresiaLibre ? "neon-border-secondary" : "neon-border"}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Gift className={`w-6 h-6 ${membresiaLibre ? "text-gym-secondary" : "text-gym-muted"}`} />
              <div>
                <p className="text-xs text-gym-muted">Membresía</p>
                <p className="text-sm font-semibold text-gym-text">
                  {membresiaLibre ? "Libre" : "Mensual"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de pagos */}
      <Card className="neon-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-gym-primary" />
              Pagos Realizados
            </div>
            <span className="text-sm font-normal text-gym-muted">{pagos.length} pago(s)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pagos.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 text-gym-muted mx-auto mb-3" />
              <p className="text-gym-muted">No hay pagos registrados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pagos.map((pago) => (
                <div
                  key={pago.id}
                  className="p-3 bg-gym-bg rounded-xl hover:bg-gym-surface transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getPagoIcon(pago)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gym-text truncate">
                          {getPagoLabel(pago)}
                        </span>
                        <Badge
                          variant={
                            pago.estado === "aprobado"
                              ? "success"
                              : pago.estado === "rechazado"
                              ? "danger"
                              : "warning"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {pago.estado === "aprobado"
                            ? "Aprobado"
                            : pago.estado === "rechazado"
                            ? "Rechazado"
                            : "Pendiente"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gym-muted">
                        <span>{pago.metodo_pago === "efectivo" ? "💵" : pago.metodo_pago === "bs" ? "🇻🇪" : pago.metodo_pago === "binance" ? "🟡" : "🏦"} {pago.monto > 0 ? formatCurrency(pago.monto) : "Gratis"}</span>
                        {pago.fecha_pago_real && (
                          <>
                            <span>·</span>
                            <span>{new Date(pago.fecha_pago_real).toLocaleDateString("es-ES")}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {pago.estado === "pendiente" && (
                      <button
                        onClick={() => handleDelete(pago.id)}
                        disabled={deleting === pago.id}
                        className="p-1.5 text-gym-danger hover:bg-gym-danger/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deleting === pago.id ? (
                          <div className="w-4 h-4 border-2 border-gym-danger border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totales */}
      {pagos.length > 0 && (
        <Card className="neon-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gym-muted flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-gym-success" />
                Aprobado
              </span>
              <span className="text-sm font-semibold text-gym-success">{formatCurrency(montoAprobado)}</span>
            </div>
            {montoPendiente > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gym-muted flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gym-warning" />
                  Pendiente
                </span>
                <span className="text-sm font-semibold text-gym-warning">{formatCurrency(montoPendiente)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-gym-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gym-text">Total</span>
                <span className="text-lg font-bold text-gym-text neon-text">{formatCurrency(montoAprobado + montoPendiente)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
