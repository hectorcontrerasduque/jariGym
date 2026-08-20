"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { configService } from "@/lib/services/config/config.service";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { CreditCard, CheckCircle, Clock, Calendar, Trash2, FileText, Plus, Search, User } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { Pago, Profile, MetodoPago } from "@/lib/types";

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

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function MisPagosPage() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());

  const isSuperAdmin = profile?.role === "super_admin";

  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [miembroSearch, setMiembroSearch] = useState("");
  const [miembroSeleccionado, setMiembroSeleccionado] = useState<Profile | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const [pagoForm, setPagoForm] = useState({
    mes: new Date().getMonth() + 1,
    anio: new Date().getFullYear(),
    metodo_pago: "efectivo" as MetodoPago,
    notas: "",
  });
  const [metodosPago, setMetodosPago] = useState<{ metodo_pago: MetodoPago; habilitado: boolean; monto_mensual: number }[]>([]);
  const [savingPago, setSavingPago] = useState(false);

  const loadData = useCallback(async () => {
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

      const isAdmin = profileData?.role === "super_admin" || profileData?.role === "admin";
      const targetId = miembroSeleccionado?.id || user.id;

      const [pagosData, aniosData] = await Promise.all([
        isAdmin ? pagosService.listarPagosUsuario(targetId, anioSeleccionado) : pagosService.listarMisPagos(anioSeleccionado),
        pagosService.aniosConPagos(targetId),
      ]);
      setPagos(pagosData);
      setAnios(aniosData);

      if (isAdmin) {
        const [metodosData, { data: miembrosData }] = await Promise.all([
          configService.getMetodosPago(),
          supabase.from("profiles").select("*").eq("activo", true).eq("registered", true).order("nombre_completo"),
        ]);
        setMetodosPago(metodosData);
        if (miembrosData) setMiembros(miembrosData);
      }
    } catch (error) {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  }, [anioSeleccionado, miembroSeleccionado]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSelectMiembro = (m: Profile | null) => {
    setMiembroSeleccionado(m);
    setShowSearch(false);
    setMiembroSearch("");
    setPagoForm({ mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), metodo_pago: "efectivo", notas: "" });
  };

  const handleSelfPay = () => {
    setMiembroSeleccionado(null);
    setPagoForm({ mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), metodo_pago: "efectivo", notas: "" });
  };

  const mesesDisponibles = MESES.filter((m) => {
    const alreadyPaid = pagos.some(
      (p) => p.mes_pagar === m && p.anio_pagar === pagoForm.anio && (p.estado === "aprobado" || p.estado === "pendiente")
    );
    return !alreadyPaid;
  });

  const getMontoByMetodo = (metodo: MetodoPago): number => {
    const config = metodosPago.find((m) => m.metodo_pago === metodo);
    return config?.monto_mensual || 0;
  };

  const handleQuickPay = async () => {
    if (mesesDisponibles.length === 0 && mesesDisponibles.indexOf(pagoForm.mes) === -1) {
      showToast("Selecciona un mes válido", "error");
      return;
    }
    setSavingPago(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const targetId = miembroSeleccionado?.id || user.id;
      const isSelf = !miembroSeleccionado || miembroSeleccionado.id === user.id;

      if (isSelf) {
        await pagosService.crearPagoAprobado({
          usuario_id: targetId,
          monto: getMontoByMetodo(pagoForm.metodo_pago),
          mes_pagar: pagoForm.mes,
          anio_pagar: pagoForm.anio,
          metodo_pago: pagoForm.metodo_pago,
          notas: pagoForm.notas || undefined,
        });
        showToast("Pago registrado y aprobado", "success");
      } else {
        await pagosService.crearPago({
          usuario_id: targetId,
          monto: getMontoByMetodo(pagoForm.metodo_pago),
          mes_pagar: pagoForm.mes,
          anio_pagar: pagoForm.anio,
          metodo_pago: pagoForm.metodo_pago,
          notas: pagoForm.notas || undefined,
        });
        showToast("Pago registrado (pendiente de aprobación)", "success");
      }

      setPagoForm({ mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), metodo_pago: "efectivo", notas: "" });
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Error al registrar pago", "error");
    } finally {
      setSavingPago(false);
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

  const filteredMiembros = miembros.filter((m) => {
    const search = miembroSearch.toLowerCase();
    return (
      m.nombre_completo?.toLowerCase().includes(search) ||
      m.email?.toLowerCase().includes(search)
    );
  });

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
          <p className="text-gym-muted text-sm">
            {isSuperAdmin
              ? miembroSeleccionado
                ? `Pagos de ${miembroSeleccionado.nombre_completo || miembroSeleccionado.email}`
                : "Tus pagos (auto-aprobados)"
              : "Historial de tus pagos"}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Super Admin: selector de miembro */}
      {isSuperAdmin && (
        <Card className="neon-card relative z-10">
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <div className="flex gap-2">
                  <Button
                    variant={miembroSeleccionado === null ? "default" : "outline"}
                    size="sm"
                    onClick={handleSelfPay}
                    className="flex-1"
                  >
                    <User className="w-4 h-4 mr-1" />
                    Yo
                  </Button>
                  <Button
                    variant={miembroSeleccionado !== null ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowSearch(!showSearch)}
                    className="flex-1"
                  >
                    <Search className="w-4 h-4 mr-1" />
                    {miembroSeleccionado
                      ? miembroSeleccionado.nombre_completo || miembroSeleccionado.email
                      : "Otro miembro"}
                  </Button>
                </div>
                {showSearch && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      placeholder="Buscar por nombre o correo..."
                      value={miembroSearch}
                      onChange={(e) => setMiembroSearch(e.target.value)}
                      className="w-full px-3 py-2 bg-gym-bg border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary"
                      autoFocus
                    />
                    {miembroSearch && (
                      <div className="max-h-40 overflow-y-auto bg-gym-bg border border-gym-border rounded-xl">
                        {filteredMiembros.length === 0 ? (
                          <p className="p-3 text-sm text-gym-muted">Sin resultados</p>
                        ) : (
                          filteredMiembros.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => handleSelectMiembro(m)}
                              className="w-full text-left p-3 hover:bg-gym-surface transition-colors border-b border-gym-border/30 last:border-0"
                            >
                              <p className="text-sm font-medium text-gym-text">{m.nombre_completo || "Sin nombre"}</p>
                              <p className="text-xs text-gym-muted">{m.email}</p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Super Admin: formulario rápido de pago */}
      {isSuperAdmin && (
        <Card className="neon-card relative z-10">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="w-5 h-5 text-gym-primary" />
              {miembroSeleccionado ? "Registrar pago para miembro" : "Auto-pago"}
              {miembroSeleccionado === null && (
                <Badge variant="success" className="text-[10px] ml-1">Auto-aprobado</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gym-muted mb-1">Mes</label>
                <select
                  value={pagoForm.mes}
                  onChange={(e) => setPagoForm({ ...pagoForm, mes: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-gym-bg border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary"
                >
                  {MESES.map((m) => (
                    <option key={m} value={m} disabled={!mesesDisponibles.includes(m) && pagoForm.mes !== m}>
                      {getMonthName(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gym-muted mb-1">Año</label>
                <select
                  value={pagoForm.anio}
                  onChange={(e) => setPagoForm({ ...pagoForm, anio: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-gym-bg border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary"
                >
                  {[new Date().getFullYear(), new Date().getFullYear() - 1].map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gym-muted mb-1">Método de pago</label>
              <div className="flex gap-2">
                {metodosPago.filter((m) => m.habilitado || m.metodo_pago === "efectivo").map((m) => (
                  <button
                    key={m.metodo_pago}
                    type="button"
                    onClick={() => setPagoForm({ ...pagoForm, metodo_pago: m.metodo_pago })}
                    className={`flex-1 p-2 rounded-xl text-sm font-medium transition-all ${
                      pagoForm.metodo_pago === m.metodo_pago
                        ? "bg-gym-primary text-white"
                        : "bg-gym-bg text-gym-muted border border-gym-border hover:border-gym-primary"
                    }`}
                  >
                    {m.metodo_pago === "efectivo" ? "💵 Efectivo" : m.metodo_pago === "bs" ? "🇻🇪 Bs" : "🟡 Binance"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-gym-muted">
                Monto: <span className="font-semibold text-gym-text">{formatCurrency(getMontoByMetodo(pagoForm.metodo_pago))}</span>
              </span>
              <Button
                onClick={handleQuickPay}
                disabled={savingPago}
                size="sm"
              >
                {savingPago ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-1" />
                )}
                {miembroSeleccionado ? "Registrar" : "Pagar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                        <span>{pago.metodo_pago === "efectivo" ? "💵" : pago.metodo_pago === "bs" ? "🇻🇪" : "🟡"} {pago.monto > 0 ? formatCurrency(pago.monto) : "Gratis"}</span>
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
