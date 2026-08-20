"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { configService } from "@/lib/services/config/config.service";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { CreditCard, CheckCircle, Clock, Calendar, Trash2, FileText, Plus, Search, User, DollarSign, Upload, Send, Gift, AlertTriangle } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { Pago, Profile, MetodoPago, MetodoPagoConfig, GymConfig } from "@/lib/types";

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function getPagoLabel(pago: Pago): string {
  if (pago.tipo_pago === "inscripcion") return "Inscripción";
  return `${getMonthName(pago.mes_pagar)} ${pago.anio_pagar}`;
}

function getPagoIcon(pago: Pago) {
  if (pago.tipo_pago === "inscripcion") return <FileText className="w-5 h-5 text-gym-primary" />;
  return <Calendar className="w-5 h-5 text-gym-secondary" />;
}

export default function MisPagosPage() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [anios, setAnios] = useState<number[]>([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [gymConfig, setGymConfig] = useState<GymConfig | null>(null);

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "super_admin" || profile?.role === "admin";

  // Super admin: member selector
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [miembroSearch, setMiembroSearch] = useState("");
  const [miembroSeleccionado, setMiembroSeleccionado] = useState<Profile | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  // Payment form
  const [showForm, setShowForm] = useState(false);
  const [metodosPago, setMetodosPago] = useState<MetodoPagoConfig[]>([]);
  const [mesesPendientes, setMesesPendientes] = useState<{ mes: number; anio: number }[]>([]);
  const [inscripcionPagada, setInscripcionPagada] = useState(false);
  const [inscripcionPendiente, setInscripcionPendiente] = useState(false);
  const [membresiaLibre, setMembresiaLibre] = useState(false);
  const [savingPago, setSavingPago] = useState(false);

  const [formData, setFormData] = useState({
    meses: [] as { mes: number; anio: number }[],
    metodo_pago: "efectivo" as MetodoPago,
    codigo_billete: "",
    notas: "",
    pagar_inscripcion: false,
    pagar_mensualidad: false,
    fecha_pago: new Date().toISOString().split("T")[0],
  });
  const [comprobante, setComprobante] = useState<File | null>(null);

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

      const targetId = miembroSeleccionado?.id || user.id;
      const currentIsAdmin = profileData?.role === "super_admin" || profileData?.role === "admin";

      const [pagosData, aniosData, config] = await Promise.all([
        currentIsAdmin ? pagosService.listarPagosUsuario(targetId, anioSeleccionado) : pagosService.listarMisPagos(anioSeleccionado),
        pagosService.aniosConPagos(targetId),
        configService.getConfig(),
      ]);
      setPagos(pagosData);
      setAnios(aniosData);
      setGymConfig(config);

      const metodos = await configService.getMetodosPago();
      setMetodosPago(metodos);

      if (isAdmin) {
        const { data: miembrosData } = await supabase
          .from("profiles")
          .select("*")
          .eq("activo", true)
          .eq("registered", true)
          .order("nombre_completo");
        if (miembrosData) setMiembros(miembrosData);
      }
    } catch (error) {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  }, [anioSeleccionado, miembroSeleccionado, isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load pending months when member changes
  const loadMiembroPendientes = useCallback(async (miembroId: string) => {
    try {
      const [meses, profile, libre, tienePendiente] = await Promise.all([
        pagosService.mesesPendientesAdmin(miembroId),
        createClient().from("profiles").select("inscripcion_pagada").eq("id", miembroId).single(),
        createClient().from("membresias").select("id").eq("usuario_id", miembroId).is("fecha_fin", null).maybeSingle(),
        pagosService.tieneInscripcionPendiente(miembroId),
      ]);
      setMesesPendientes(meses);
      if (profile.data) setInscripcionPagada(profile.data.inscripcion_pagada);
      setInscripcionPendiente(tienePendiente);
      setMembresiaLibre(!!libre.data);
      setFormData(prev => ({ ...prev, meses: [], pagar_inscripcion: false, pagar_mensualidad: false }));
    } catch {
      showToast(messages.toast.errorCargaDatos, "error");
    }
  }, []);

  const loadSelfPendientes = useCallback(async (userId: string) => {
    try {
      const [meses, profile, libre, tienePendiente] = await Promise.all([
        pagosService.mesesPendientes(userId),
        createClient().from("profiles").select("inscripcion_pagada").eq("id", userId).single(),
        createClient().from("membresias").select("id").eq("usuario_id", userId).is("fecha_fin", null).maybeSingle(),
        pagosService.tieneInscripcionPendiente(userId),
      ]);
      setMesesPendientes(meses);
      if (profile.data) setInscripcionPagada(profile.data.inscripcion_pagada);
      setInscripcionPendiente(tienePendiente);
      setMembresiaLibre(!!libre.data);
      setFormData(prev => ({ ...prev, meses: [], pagar_inscripcion: false, pagar_mensualidad: false }));
    } catch {
      showToast(messages.toast.errorCargaDatos, "error");
    }
  }, []);

  useEffect(() => {
    if (!showForm) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const targetId = miembroSeleccionado?.id || user.id;
      if (miembroSeleccionado) {
        loadMiembroPendientes(targetId);
      } else {
        loadSelfPendientes(targetId);
      }
    });
  }, [showForm, miembroSeleccionado, loadMiembroPendientes, loadSelfPendientes]);

  const handleSelectMiembro = (m: Profile | null) => {
    setMiembroSeleccionado(m);
    setShowSearch(false);
    setMiembroSearch("");
    setFormData({ meses: [], metodo_pago: "efectivo", codigo_billete: "", notas: "", pagar_inscripcion: false, pagar_mensualidad: false, fecha_pago: new Date().toISOString().split("T")[0] });
  };

  const toggleMonth = (mes: number, anio: number) => {
    setFormData(prev => {
      const existe = prev.meses.some(m => m.mes === mes && m.anio === anio);
      const meses = existe ? prev.meses.filter(m => !(m.mes === mes && m.anio === anio)) : [...prev.meses, { mes, anio }];
      return { ...prev, meses, pagar_mensualidad: meses.length > 0 ? true : prev.pagar_mensualidad };
    });
  };

  const selectAllMonths = () => {
    setFormData(prev => ({ ...prev, meses: [...mesesPendientes], pagar_mensualidad: true }));
  };

  const getMontoByMetodo = useCallback((metodo: MetodoPago, tipo: "mensual" | "inscripcion"): number => {
    const config = metodosPago.find(m => m.metodo_pago === metodo);
    if (!config || !config.habilitado) {
      const def = metodosPago.find(m => m.metodo_pago === "efectivo");
      return tipo === "mensual" ? (def?.monto_mensual || 0) : (def?.monto_inscripcion || 0);
    }
    return tipo === "mensual" ? config.monto_mensual : config.monto_inscripcion;
  }, [metodosPago]);

  const montoTotal = useMemo(() => {
    let total = 0;
    if (formData.pagar_inscripcion && !inscripcionPagada && getMontoByMetodo(formData.metodo_pago, "inscripcion") > 0) {
      total += getMontoByMetodo(formData.metodo_pago, "inscripcion");
    }
    if (formData.pagar_mensualidad && formData.meses.length > 0) {
      total += formData.meses.length * getMontoByMetodo(formData.metodo_pago, "mensual");
    }
    return total;
  }, [formData, inscripcionPagada, getMontoByMetodo]);

  const needsComprobante = (metodo: MetodoPago) => metodo !== "efectivo";

  const handleSubmitPago = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPago(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const targetId = miembroSeleccionado?.id || user.id;
      const isSelf = !miembroSeleccionado || miembroSeleccionado.id === user.id;

      if (!formData.pagar_inscripcion && !formData.pagar_mensualidad) {
        throw new Error("Selecciona al menos inscripción o mensualidad");
      }
      if (formData.pagar_mensualidad && formData.meses.length === 0) {
        throw new Error("Selecciona al menos un mes");
      }

      let comprobanteUrl = "";
      if (needsComprobante(formData.metodo_pago) && comprobante) {
        const fileName = `${targetId}/${Date.now()}_${comprobante.name}`;
        const { error: uploadError } = await supabase.storage.from("comprobantes").upload(fileName, comprobante);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("comprobantes").getPublicUrl(fileName);
        comprobanteUrl = urlData.publicUrl;
      }

      const useAutoApprove = isSelf && isAdmin;

      if (formData.pagar_inscripcion && !inscripcionPagada && getMontoByMetodo(formData.metodo_pago, "inscripcion") > 0) {
        const pagoData = {
          usuario_id: targetId, monto: getMontoByMetodo(formData.metodo_pago, "inscripcion"),
          mes_pagar: new Date().getMonth() + 1, anio_pagar: new Date().getFullYear(),
          metodo_pago: formData.metodo_pago, tipo_pago: "inscripcion",
          comprobante_url: comprobanteUrl || undefined, notas: "Inscripción", fecha_pago_real: formData.fecha_pago,
        };
        if (useAutoApprove) {
          await pagosService.crearPagoAprobado(pagoData);
        } else {
          await pagosService.crearPago(pagoData);
        }
      }

      if (formData.pagar_mensualidad && formData.meses.length > 0) {
        for (const { mes, anio } of formData.meses) {
          const pagoData = {
            usuario_id: targetId, monto: getMontoByMetodo(formData.metodo_pago, "mensual"),
            mes_pagar: mes, anio_pagar: anio, metodo_pago: formData.metodo_pago, tipo_pago: "membresia",
            comprobante_url: comprobanteUrl || undefined, notas: formData.notas || undefined, fecha_pago_real: formData.fecha_pago,
          };
          if (useAutoApprove) {
            await pagosService.crearPagoAprobado(pagoData);
          } else {
            await pagosService.crearPago(pagoData);
          }
        }
      }

      showToast(isSelf ? "Pago registrado y aprobado" : "Pago registrado (pendiente de aprobación)", "success");
      setShowForm(false);
      setFormData({ meses: [], metodo_pago: "efectivo", codigo_billete: "", notas: "", pagar_inscripcion: false, pagar_mensualidad: false, fecha_pago: new Date().toISOString().split("T")[0] });
      setComprobante(null);
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

  const aprobados = pagos.filter(p => p.estado === "aprobado");
  const pendientes = pagos.filter(p => p.estado === "pendiente");
  const montoAprobado = aprobados.reduce((sum, p) => sum + (p.monto || 0), 0);
  const montoPendiente = pendientes.reduce((sum, p) => sum + (p.monto || 0), 0);

  const filteredMiembros = miembros.filter(m => {
    const s = miembroSearch.toLowerCase();
    return m.nombre_completo?.toLowerCase().includes(s) || m.email?.toLowerCase().includes(s);
  });

  const showInscriptionCheckbox = !inscripcionPagada && !inscripcionPendiente && gymConfig && getMontoByMetodo(formData.metodo_pago, "inscripcion") > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Mis Pagos</h1>
          <p className="text-gym-muted text-sm">
            {miembroSeleccionado ? `Pagos de ${miembroSeleccionado.nombre_completo || miembroSeleccionado.email}` : "Historial y registro de pagos"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={anioSeleccionado}
            onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
            className="px-4 py-2 bg-gym-surface border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary"
          >
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Pagar
          </Button>
        </div>
      </div>

      {/* Super Admin: member selector */}
      {isSuperAdmin && (
        <Card className="neon-card relative z-10">
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <div className="flex gap-2">
                  <Button
                    variant={miembroSeleccionado === null ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => handleSelectMiembro(null)}
                    className="flex-1"
                  >
                    <User className="w-4 h-4 mr-1" /> Yo
                  </Button>
                  <Button
                    variant={miembroSeleccionado !== null ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => setShowSearch(!showSearch)}
                    className="flex-1"
                  >
                    <Search className="w-4 h-4 mr-1" />
                    {miembroSeleccionado ? miembroSeleccionado.nombre_completo || miembroSeleccionado.email : "Otro miembro"}
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
                          filteredMiembros.map(m => (
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

      {/* Payment form */}
      {showForm && (
        <Card className="neon-card relative z-10">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="w-5 h-5 text-gym-primary" />
              {miembroSeleccionado ? `Pagar para ${miembroSeleccionado.nombre_completo}` : "Registrar pago"}
              {!miembroSeleccionado && <Badge variant="success" className="text-[10px] ml-1">Auto-aprobado</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {membresiaLibre ? (
              <div className="text-center py-6">
                <Gift className="w-12 h-12 text-gym-secondary mx-auto mb-3" />
                <p className="font-medium text-gym-text">Membresía Libre</p>
                <p className="text-sm text-gym-muted">No tienes cargo mensual</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitPago} className="space-y-4">
                {/* Concepto de pago */}
                <div>
                  <label className="text-sm font-medium text-gym-muted mb-2 block">Concepto de pago</label>
                  <div className="space-y-2">
                    {showInscriptionCheckbox && (
                      <label className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl cursor-pointer hover:bg-gym-surface transition-colors">
                        <input
                          type="checkbox"
                          checked={formData.pagar_inscripcion}
                          onChange={(e) => setFormData({ ...formData, pagar_inscripcion: e.target.checked })}
                          className="w-5 h-5 rounded border-gym-border text-gym-primary focus:ring-gym-primary"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gym-text">Inscripción</p>
                          <p className="text-xs text-gym-muted">{formatCurrency(getMontoByMetodo(formData.metodo_pago, "inscripcion"))}</p>
                        </div>
                        <Badge variant="warning">Pendiente</Badge>
                      </label>
                    )}
                    <label className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl cursor-pointer hover:bg-gym-surface transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.pagar_mensualidad}
                        onChange={(e) => setFormData({ ...formData, pagar_mensualidad: e.target.checked })}
                        className="w-5 h-5 rounded border-gym-border text-gym-primary focus:ring-gym-primary"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gym-text">Mensualidad</p>
                        <p className="text-xs text-gym-muted">{formatCurrency(getMontoByMetodo(formData.metodo_pago, "mensual"))} × {formData.meses.length} mes(es)</p>
                      </div>
                      <Badge variant="primary">{formData.meses.length} meses</Badge>
                    </label>
                  </div>
                  {!formData.pagar_inscripcion && !formData.pagar_mensualidad && (
                    <div className="flex items-center gap-2 mt-3 p-3 bg-gym-warning/10 border border-gym-warning/30 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-gym-warning flex-shrink-0" />
                      <p className="text-sm text-gym-warning">Debe seleccionar un concepto de pago</p>
                    </div>
                  )}
                </div>

                {/* Months selector */}
                {formData.pagar_mensualidad && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-gym-muted">Meses a pagar</label>
                      <Button type="button" variant="ghost" size="sm" onClick={selectAllMonths}>Seleccionar todos</Button>
                    </div>
                    {mesesPendientes.length === 0 ? (
                      <div className="text-center py-8 bg-gym-bg rounded-xl">
                        <CheckCircle className="w-12 h-12 text-gym-success mx-auto mb-2 animate-pulse-glow" />
                        <p className="text-gym-muted font-medium">Sin deuda mensual</p>
                        <p className="text-xs text-gym-muted mt-1">Todos los meses están al día</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {mesesPendientes.map(({ mes, anio }) => {
                          const seleccionado = formData.meses.some(m => m.mes === mes && m.anio === anio);
                          return (
                            <button
                              key={`${anio}-${mes}`}
                              type="button"
                              onClick={() => toggleMonth(mes, anio)}
                              className={`p-2 rounded-xl text-sm font-medium transition-all ${
                                seleccionado
                                  ? "bg-gym-primary text-gym-bg glow-primary"
                                  : "bg-gym-bg text-gym-muted border border-gym-border hover:border-gym-primary hover:shadow-[0_0_10px_rgba(56,189,248,0.2)]"
                              }`}
                            >
                              <div className="text-center">
                                <div className="font-semibold">{getMonthName(mes).slice(0, 3)}</div>
                                <div className="text-xs opacity-75">{anio}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-xs text-gym-muted mt-2">{formData.meses.length} mes(es) seleccionados</p>
                    {formData.meses.length === 0 && mesesPendientes.length > 0 && (
                      <div className="flex items-center gap-2 mt-3 p-3 bg-gym-warning/10 border border-gym-warning/30 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-gym-warning flex-shrink-0" />
                        <p className="text-sm text-gym-warning">Debe seleccionar mes(es) a pagar</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Payment method */}
                <div>
                  <label className="block text-sm font-medium text-gym-muted mb-2">Método de pago</label>
                  <div className="flex gap-2">
                    {metodosPago.filter(m => m.habilitado || m.metodo_pago === "efectivo").map(m => (
                      <button
                        key={m.metodo_pago}
                        type="button"
                        onClick={() => setFormData({ ...formData, metodo_pago: m.metodo_pago })}
                        className={`flex-1 p-2 rounded-xl text-sm font-medium transition-all ${
                          formData.metodo_pago === m.metodo_pago
                            ? "bg-gym-primary text-white"
                            : "bg-gym-bg text-gym-muted border border-gym-border hover:border-gym-primary"
                        }`}
                      >
                        {m.metodo_pago === "efectivo" ? "💵 Efectivo" : m.metodo_pago === "bs" ? "🇻🇪 Bs" : "🟡 Binance"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bill code for cash */}
                {formData.metodo_pago === "efectivo" && (
                  <div>
                    <label className="block text-sm font-medium text-gym-muted mb-2">
                      <FileText className="w-4 h-4 inline mr-1" /> Código(s) del billete
                    </label>
                    <input
                      placeholder="Ej: A1B2C, D3E4F"
                      value={formData.codigo_billete}
                      onChange={(e) => setFormData({ ...formData, codigo_billete: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary"
                    />
                  </div>
                )}

                {/* Comprobante for non-cash */}
                {needsComprobante(formData.metodo_pago) && (
                  <div>
                    <label className="block text-sm font-medium text-gym-muted mb-2">Comprobante de pago</label>
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gym-border rounded-xl cursor-pointer hover:border-gym-primary transition-colors">
                      <Upload className="w-6 h-6 text-gym-muted mb-1" />
                      <span className="text-xs text-gym-muted">{comprobante ? comprobante.name : "Adjuntar imagen o PDF"}</span>
                      <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setComprobante(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gym-muted mb-2">Notas (opcional)</label>
                  <textarea
                    placeholder="Algún comentario..."
                    value={formData.notas}
                    onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary resize-none h-16"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gym-muted mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" /> Fecha de pago
                  </label>
                  <input
                    type="date"
                    value={formData.fecha_pago}
                    onChange={(e) => setFormData({ ...formData, fecha_pago: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary"
                  />
                </div>

                {/* Total */}
                <div className="p-4 bg-gym-bg rounded-xl neon-border">
                  <div className="flex items-center justify-between">
                    <span className="text-gym-muted">Total a pagar:</span>
                    <span className="text-2xl font-bold text-gym-text neon-text">{formatCurrency(montoTotal)}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    loading={savingPago}
                    disabled={
                      (!formData.pagar_inscripcion && !formData.pagar_mensualidad) ||
                      (formData.pagar_mensualidad && formData.meses.length === 0) ||
                      montoTotal === 0
                    }
                  >
                    <Send className="w-4 h-4 mr-1" />
                    {!miembroSeleccionado ? "Pagar" : "Enviar Pago"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment list */}
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
            <div className="max-h-32 overflow-y-auto space-y-2 pr-1">
              {pagos.map(pago => (
                <div key={pago.id} className="p-2.5 bg-gym-bg rounded-xl hover:bg-gym-surface transition-colors">
                  <div className="flex items-center gap-2">
                    {getPagoIcon(pago)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gym-text truncate">{getPagoLabel(pago)}</span>
                        <Badge
                          variant={pago.estado === "aprobado" ? "success" : pago.estado === "rechazado" ? "danger" : "warning"}
                          className="text-[10px] px-1.5 py-0 flex-shrink-0"
                        >
                          {pago.estado === "aprobado" ? "Aprobado" : pago.estado === "rechazado" ? "Rechazado" : pago.estado === "suspendido" ? "Suspendido" : "Pendiente"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gym-muted">
                        <span>{pago.monto > 0 ? formatCurrency(pago.monto) : "Gratis"}</span>
                        {pago.fecha_pago_real && (
                          <>
                            <span>·</span>
                            <span>{new Date(pago.fecha_pago_real).toLocaleDateString("es-ES")}</span>
                          </>
                        )}
                        {pago.codigo_billete && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{pago.codigo_billete}</span>
                          </>
                        )}
                      </div>
                      {pago.notas && (
                        <p className="text-[10px] text-gym-muted/70 truncate mt-0.5">{pago.notas}</p>
                      )}
                    </div>
                    {pago.estado === "pendiente" && (
                      <button
                        onClick={() => handleDelete(pago.id)}
                        disabled={deleting === pago.id}
                        className="p-1.5 text-gym-danger hover:bg-gym-danger/10 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
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

      {/* Totals */}
      {pagos.length > 0 && (
        <Card className="neon-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gym-muted flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-gym-success" /> Aprobado
              </span>
              <span className="text-sm font-semibold text-gym-success">{formatCurrency(montoAprobado)}</span>
            </div>
            {montoPendiente > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gym-muted flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gym-warning" /> Pendiente
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
