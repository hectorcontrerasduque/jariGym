"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getMonthName, formatDateTime } from "@/lib/utils";
import { CreditCard, CheckCircle, Clock, Gift, Calendar } from "lucide-react";
import type { Pago, Profile } from "@/lib/types";

export default function MisPagosPage() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());

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
        pagosService.listarMisPagos(user.id, anioSeleccionado),
        pagosService.aniosConPagos(),
      ]);
      setPagos(pagosData);
      setAnios(aniosData);
    } catch (error) {
      console.error("Error:", error);
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
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Mis Pagos</h1>
          <p className="text-gym-muted text-sm">Historial de tus pagos realizados</p>
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

      {/* Estado de inscripción y membresía */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className={profile?.inscripcion_pagada ? "neon-border-success" : "neon-border-warning"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {profile?.inscripcion_pagada ? (
                <CheckCircle className="w-8 h-8 text-gym-success" />
              ) : (
                <Clock className="w-8 h-8 text-gym-warning" />
              )}
              <div>
                <p className="text-sm text-gym-muted">Inscripción</p>
                <p className="font-semibold text-gym-text">
                  {profile?.inscripcion_pagada ? "Pagada" : "Pendiente"}
                </p>
                {profile?.inscripcion_pagada && profile?.inscripcion_fecha && (
                  <p className="text-xs text-gym-muted">
                    {new Date(profile.inscripcion_fecha).toLocaleDateString("es-ES")}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={profile?.membresia_libre ? "neon-border-secondary" : "neon-border"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Gift className={`w-8 h-8 ${profile?.membresia_libre ? "text-gym-secondary" : "text-gym-muted"}`} />
              <div>
                <p className="text-sm text-gym-muted">Membresía</p>
                <p className="font-semibold text-gym-text">
                  {profile?.membresia_libre ? "Membresía Libre" : "Mensualidad"}
                </p>
                {profile?.membresia_libre && (
                  <p className="text-xs text-gym-muted">Otorgada por admin</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de pagos */}
      <Card className="neon-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gym-primary" />
            Pagos Realizados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pagos.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 text-gym-muted mx-auto mb-3" />
              <p className="text-gym-muted">No hay pagos registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pagos.map((pago) => (
                <div
                  key={pago.id}
                  className="p-4 bg-gym-bg rounded-xl hover:bg-gym-surface transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gym-text">
                          {getMonthName(pago.mes_pagar)}
                        </span>
                        <span className="text-gym-muted text-sm">
                          {pago.anio_pagar}
                        </span>
                      </div>
                      <p className="text-xs text-gym-muted">
                        Reportado: {formatDateTime(pago.created_at)}
                      </p>
                      {pago.approved_at && (
                        <p className="text-xs text-gym-success">
                          Confirmado: {formatDateTime(pago.approved_at)}
                        </p>
                      )}
                      {pago.notas && (
                        <p className="text-xs text-gym-muted mt-1 italic">
                          {pago.notas}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <p className="font-bold text-gym-text neon-text">
                        {formatCurrency(pago.monto)}
                      </p>
                      <Badge
                        variant={
                          pago.estado === "aprobado"
                            ? "success"
                            : pago.estado === "rechazado"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {pago.estado === "aprobado"
                          ? "Aprobado"
                          : pago.estado === "rechazado"
                          ? "Rechazado"
                          : "Pendiente"}
                      </Badge>
                    </div>
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
