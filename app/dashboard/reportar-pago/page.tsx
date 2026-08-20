"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { configService } from "@/lib/services/config/config.service";
import { miembrosService } from "@/lib/services/miembros/miembros.service";
import { createClient } from "@/lib/supabase/client";
import { Upload, CheckCircle, XCircle, DollarSign, User, FileText, Gift, Calendar, ArrowLeft, AlertTriangle, Send } from "lucide-react";
import { getMonthName, formatCurrency, formatDate } from "@/lib/utils";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { MetodoPago, GymConfig, MetodoPagoConfig, Profile } from "@/lib/types";
import Link from "next/link";

interface MembresiaLibreInfo {
  fecha_inicio: string;
  fecha_fin: string | null;
  asignado_por_nombre: string | null;
}

export default function ReportarPagoPage() {
  return (
    <Suspense>
      <ReportarPagoForm />
    </Suspense>
  );
}

function ReportarPagoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const memberParam = searchParams.get("member");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [gymConfig, setGymConfig] = useState<GymConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [metodosPago, setMetodosPago] = useState<MetodoPagoConfig[]>([]);
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [miembroSeleccionado, setMiembroSeleccionado] = useState<string>("");
  const [inscripcionPagada, setInscripcionPagada] = useState(false);
  const [inscripcionPendiente, setInscripcionPendiente] = useState(false);
  const [mesesPendientes, setMesesPendientes] = useState<{ mes: number; anio: number }[]>([]);
  const [membresiaLibreInfo, setMembresiaLibreInfo] = useState<MembresiaLibreInfo | null>(null);

  const [formData, setFormData] = useState({
    meses: [] as { mes: number; anio: number }[],
    metodo_pago: "efectivo" as MetodoPago,
    codigo_billete: "",
    notas: "",
    pagar_inscripcion: false,
    pagar_mensualidad: false,
    estado_pago: "aprobado" as "pendiente" | "aprobado",
    fecha_pago: new Date().toISOString().split("T")[0],
  });
  const [comprobante, setComprobante] = useState<File | null>(null);

  const isAdmin = userRole === "super_admin" || userRole === "admin";

  useEffect(() => {
    if (isAdmin && memberParam && miembros.length > 0) {
      setMiembroSeleccionado(memberParam);
    }
  }, [memberParam, miembros, isAdmin]);

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, inscripcion_pagada")
          .eq("id", user.id)
          .single();

        if (profile) {
          setUserRole(profile.role);
          setInscripcionPagada(profile.inscripcion_pagada);
        }

        const currentIsAdmin = profile?.role === "super_admin" || profile?.role === "admin";

        if (currentIsAdmin) {
          const members = await miembrosService.listarMiembros();
          setMiembros(members);
        } else {
          const [meses, tienePendiente] = await Promise.all([
            pagosService.mesesPendientes(user.id),
            pagosService.tieneInscripcionPendiente(user.id),
          ]);
          setMesesPendientes(meses);
          setInscripcionPendiente(tienePendiente);

          const { data: libreData } = await supabase
            .from("membresias")
            .select("fecha_inicio, fecha_fin, asignado_por_nombre")
            .eq("usuario_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (libreData) {
            setMembresiaLibreInfo(libreData as MembresiaLibreInfo);
          }
        }
      }

      const config = await configService.getConfig();
      setGymConfig(config);

      const metodos = await configService.getMetodosPago();
      setMetodosPago(metodos);
    } catch (err) {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadMiembroPendientes = useCallback(async (miembroId: string) => {
    try {
      const [meses, profile, libreData, tienePendiente] = await Promise.all([
        pagosService.mesesPendientesAdmin(miembroId),
        createClient().from("profiles").select("inscripcion_pagada").eq("id", miembroId).single(),
        createClient().from("membresias").select("fecha_inicio, fecha_fin, asignado_por_nombre").eq("usuario_id", miembroId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        pagosService.tieneInscripcionPendiente(miembroId),
      ]);

      setMesesPendientes(meses);
      if (profile.data) setInscripcionPagada(profile.data.inscripcion_pagada);
      setInscripcionPendiente(tienePendiente);

      if (libreData.data) {
        setMembresiaLibreInfo(libreData.data as MembresiaLibreInfo);
      } else {
        setMembresiaLibreInfo(null);
      }

      setFormData(prev => ({ ...prev, meses: [], pagar_inscripcion: false, pagar_mensualidad: false }));
    } catch (err) {
      showToast(messages.toast.errorCargaDatos, "error");
    }
  }, []);

  useEffect(() => {
    if (isAdmin && miembroSeleccionado) {
      loadMiembroPendientes(miembroSeleccionado);
    }
  }, [miembroSeleccionado, isAdmin, loadMiembroPendientes]);

  const toggleMonth = (mes: number, anio: number) => {
    setFormData((prev) => {
      const existe = prev.meses.some((m) => m.mes === mes && m.anio === anio);
      const meses = existe
        ? prev.meses.filter((m) => !(m.mes === mes && m.anio === anio))
        : [...prev.meses, { mes, anio }];
      return { ...prev, meses, pagar_mensualidad: meses.length > 0 ? true : prev.pagar_mensualidad };
    });
  };

  const selectAll = () => {
    setFormData((prev) => ({ ...prev, meses: [...mesesPendientes], pagar_mensualidad: true }));
  };

  const getMontoByMetodo = useCallback((metodo: MetodoPago, tipo: "mensual" | "inscripcion"): number => {
    const config = metodosPago.find((m) => m.metodo_pago === metodo);
    if (!config || !config.habilitado) {
      const defaultConfig = metodosPago.find((m) => m.metodo_pago === "efectivo");
      return tipo === "mensual" ? (defaultConfig?.monto_mensual || 0) : (defaultConfig?.monto_inscripcion || 0);
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
  }, [formData.metodo_pago, formData.pagar_inscripcion, formData.pagar_mensualidad, formData.meses, inscripcionPagada, getMontoByMetodo]);

  const needsComprobante = (metodo: MetodoPago): boolean => {
    return metodo !== "efectivo";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const targetUserId = isAdmin && miembroSeleccionado ? miembroSeleccionado : userId;

      if (!formData.pagar_inscripcion && !formData.pagar_mensualidad) {
        throw new Error("Selecciona al menos inscripción o mensualidad");
      }

      if (formData.pagar_mensualidad && formData.meses.length === 0) {
        throw new Error("Selecciona al menos un mes");
      }

      if (!isAdmin && formData.pagar_inscripcion && inscripcionPagada) {
        throw new Error("La inscripción ya está pagada");
      }

      let comprobanteUrl = "";

      if (needsComprobante(formData.metodo_pago) && comprobante) {
        const supabase = createClient();
        const fileName = `${targetUserId}/${Date.now()}_${comprobante.name}`;
        const { error: uploadError } = await supabase.storage
          .from("comprobantes")
          .upload(fileName, comprobante);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("comprobantes").getPublicUrl(fileName);
        comprobanteUrl = urlData.publicUrl;
      }

      if (formData.pagar_inscripcion && !inscripcionPagada && getMontoByMetodo(formData.metodo_pago, "inscripcion") > 0) {
        const pagoInscripcion = await pagosService.crearPago({
          usuario_id: targetUserId,
          monto: getMontoByMetodo(formData.metodo_pago, "inscripcion"),
          mes_pagar: new Date().getMonth() + 1,
          anio_pagar: new Date().getFullYear(),
          metodo_pago: formData.metodo_pago,
          comprobante_url: comprobanteUrl || undefined,
          codigo_billete: formData.metodo_pago === "efectivo" ? formData.codigo_billete : undefined,
          notas: `Inscripción - ${formData.notas || ""}`,
          fecha_pago_real: formData.fecha_pago,
        });

        if (isAdmin && formData.estado_pago === "aprobado") {
          await pagosService.aprobarPago(pagoInscripcion.id);
        }
      }

      if (formData.pagar_mensualidad && formData.meses.length > 0) {
        for (const { mes, anio } of formData.meses) {
          const pago = await pagosService.crearPago({
            usuario_id: targetUserId,
            monto: getMontoByMetodo(formData.metodo_pago, "mensual"),
            mes_pagar: mes,
            anio_pagar: anio,
            metodo_pago: formData.metodo_pago,
            comprobante_url: comprobanteUrl || undefined,
            codigo_billete: formData.metodo_pago === "efectivo" ? formData.codigo_billete : undefined,
            notas: formData.notas || undefined,
            fecha_pago_real: formData.fecha_pago,
          });

          if (isAdmin && formData.estado_pago === "aprobado") {
            await pagosService.aprobarPago(pago.id);
          }
        }
      }

      setSuccess(true);
      setTimeout(() => router.push(isAdmin ? "/dashboard/pagos" : "/dashboard/mis-pagos"), 2000);
    } catch (err: any) {
      setError(err.message || "Error al reportar pago");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <Card className="w-full max-w-md neon-border-success">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 text-gym-success mx-auto mb-4 animate-pulse-glow" />
            <h2 className="text-xl font-semibold text-gym-text mb-2 neon-text-success">Pago Reportado</h2>
            <p className="text-gym-muted">{isAdmin && formData.estado_pago === "aprobado" ? "Pago registrado y aprobado" : "Tu pago está pendiente de aprobación"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showInscriptionCheckbox = !inscripcionPagada && !inscripcionPendiente && gymConfig && getMontoByMetodo(formData.metodo_pago, "inscripcion") > 0;
  const isLibre = membresiaLibreInfo && !membresiaLibreInfo.fecha_fin;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <LoadingOverlay show={loading} message="Enviando pago..." />
      <div className="flex items-center gap-3">
        <Link href={isAdmin ? "/dashboard/pagos" : "/dashboard/mis-pagos"} className="p-2 hover:bg-gym-bg/50 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gym-muted" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Reportar Pago</h1>
          <p className="text-gym-muted text-sm">
            {isAdmin ? "Selecciona el miembro, concepto y método de pago" : "Selecciona los meses y método de pago"}
          </p>
        </div>
      </div>

      {/* Membresía libre info - para ambos perfiles */}
      {isLibre && (
        <Card className="neon-border-secondary bg-gradient-to-r from-gym-secondary/10 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Gift className="w-8 h-8 text-gym-secondary flex-shrink-0" />
              <div>
                <p className="font-medium text-gym-text">Membresía Libre</p>
                <div className="flex items-center gap-2 text-xs text-gym-muted">
                  <Calendar className="w-3 h-3" />
                  <span>Desde: {new Date(membresiaLibreInfo!.fecha_inicio).toLocaleDateString("es-ES")}</span>
                </div>
                {membresiaLibreInfo!.asignado_por_nombre && (
                  <p className="text-xs text-gym-muted">
                    Asignada por: {membresiaLibreInfo!.asignado_por_nombre}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin: Member selector */}
      {isAdmin && (
        <Card className="neon-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <User className="w-5 h-5 text-gym-primary" />
              <label className="text-sm font-medium text-gym-muted">Seleccionar Miembro</label>
            </div>
            <select
              value={miembroSeleccionado}
              onChange={(e) => setMiembroSeleccionado(e.target.value)}
              className="w-full px-4 py-3 bg-gym-bg border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary focus:border-gym-primary"
            >
              <option value="">-- Seleccionar miembro --</option>
              {miembros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre_completo} ({m.email || "sin email"})
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {/* Inscription status */}
      {inscripcionPagada && (
        <Card className="neon-border-success">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-gym-success" />
              <div>
                <p className="font-medium text-gym-text">Inscripción pagada</p>
                <p className="text-sm text-gym-muted">{formatCurrency(getMontoByMetodo(formData.metodo_pago, "inscripcion"))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly rate */}
      {gymConfig && (
        <Card className="neon-card bg-gradient-to-r from-gym-primary/10 to-gym-secondary/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-6 h-6 text-gym-primary" />
              <div>
                <p className="text-sm text-gym-muted">Mensualidad</p>
                <p className="text-xl font-bold text-gym-text neon-text">{formatCurrency(getMontoByMetodo(formData.metodo_pago, "mensual"))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="neon-card">
        <CardContent className="p-6">
          {configLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-gym-muted text-sm">Cargando configuración...</p>
            </div>
          ) : !gymConfig ? (
            <div className="text-center py-8">
              <DollarSign className="w-12 h-12 text-gym-warning mx-auto mb-3" />
              <p className="text-gym-warning font-medium">Configuración no disponible</p>
              <p className="text-xs text-gym-muted mt-1">No se encontró la configuración del gimnasio. Contacta al administrador.</p>
            </div>
          ) : (
          <form id="pago-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Payment concept checkboxes */}
            <div>
              <label className="text-sm font-medium text-gym-muted mb-3 block">Concepto de pago</label>
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

              {/* Alert: no concepto seleccionado */}
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
                  <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                    Seleccionar todos
                  </Button>
                </div>
                {mesesPendientes.length === 0 ? (
                  <div className="text-center py-8 bg-gym-bg rounded-xl">
                    <CheckCircle className="w-12 h-12 text-gym-success mx-auto mb-2 animate-pulse-glow" />
                    <p className="text-gym-muted font-medium">Sin deuda mensual</p>
                    <p className="text-xs text-gym-muted mt-1">
                      {isAdmin && !miembroSeleccionado
                        ? "Selecciona un miembro primero"
                        : "Todos los meses están al día"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {mesesPendientes.map(({ mes, anio }) => {
                      const seleccionado = formData.meses.some((m) => m.mes === mes && m.anio === anio);
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
                <p className="text-xs text-gym-muted mt-2">
                  {formData.meses.length} mes(es) seleccionados
                </p>

                {/* Alert: sin meses seleccionados */}
                {formData.meses.length === 0 && mesesPendientes.length > 0 && (
                  <div className="flex items-center gap-2 mt-3 p-3 bg-gym-warning/10 border border-gym-warning/30 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-gym-warning flex-shrink-0" />
                    <p className="text-sm text-gym-warning">Debe seleccionar mes(es) a pagar</p>
                  </div>
                )}
              </div>
            )}

            {/* Admin: Status selector */}
            {isAdmin && (formData.pagar_inscripcion || (formData.pagar_mensualidad && formData.meses.length > 0)) && (
              <div>
                <label className="text-sm font-medium text-gym-muted mb-3 block">Estado del pago</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, estado_pago: "aprobado" })}
                    className={`p-3 rounded-xl text-sm font-medium transition-all ${
                      formData.estado_pago === "aprobado"
                        ? "bg-gym-success text-white glow-success"
                        : "bg-gym-bg text-gym-muted border border-gym-border hover:border-gym-success"
                    }`}
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, estado_pago: "pendiente" })}
                    className={`p-3 rounded-xl text-sm font-medium transition-all ${
                      formData.estado_pago === "pendiente"
                        ? "bg-gym-warning text-gym-bg glow-warning"
                        : "bg-gym-bg text-gym-muted border border-gym-border hover:border-gym-warning"
                    }`}
                  >
                    Pendiente
                  </button>
                </div>
              </div>
            )}

            {/* Payment method */}
            <div>
              <label className="block text-sm font-medium text-gym-muted mb-3">Método de pago</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, metodo_pago: "efectivo" })}
                  className={`p-3 rounded-xl text-sm font-medium transition-all ${
                    formData.metodo_pago === "efectivo"
                      ? "bg-gym-success text-white glow-success"
                      : "bg-gym-bg text-gym-muted border border-gym-border hover:border-gym-success hover:shadow-[0_0_10px_rgba(52,211,153,0.2)]"
                  }`}
                >
                  💵 Efectivo
                </button>
                {metodosPago.find(m => m.metodo_pago === "bs")?.habilitado && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, metodo_pago: "bs" })}
                    className={`p-3 rounded-xl text-sm font-medium transition-all ${
                      formData.metodo_pago === "bs"
                        ? "bg-gym-success text-white glow-success"
                        : "bg-gym-bg text-gym-muted border border-gym-border hover:border-gym-success"
                    }`}
                  >
                    🇻🇪 Bs
                  </button>
                )}
                {metodosPago.find(m => m.metodo_pago === "binance")?.habilitado && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, metodo_pago: "binance" })}
                    className={`p-3 rounded-xl text-sm font-medium transition-all ${
                      formData.metodo_pago === "binance"
                        ? "bg-gym-warning text-gym-bg glow-warning"
                        : "bg-gym-bg text-gym-muted border border-gym-border hover:border-gym-warning"
                    }`}
                  >
                    🟡 Binance
                  </button>
                )}
              </div>
            </div>

            {/* Bill code for cash */}
            {formData.metodo_pago === "efectivo" && (
              <div>
                <label className="block text-sm font-medium text-gym-muted mb-2">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Código(s) del billete (separados por coma)
                </label>
                <textarea
                  placeholder="Ej: A1B2C, D3E4F, G5H6I"
                  value={formData.codigo_billete}
                  onChange={(e) => setFormData({ ...formData, codigo_billete: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text placeholder:text-gym-muted focus:outline-none focus:ring-2 focus:ring-gym-primary resize-none h-20"
                  required
                />
                <p className="text-xs text-gym-muted mt-1">Últimos 5 caracteres de cada billete. Si son varios, separar por coma.</p>
              </div>
            )}

            {/* Comprobante for non-cash */}
            {needsComprobante(formData.metodo_pago) && (
              <div>
                <label className="block text-sm font-medium text-gym-muted mb-2">Comprobante de pago</label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gym-border rounded-xl cursor-pointer hover:border-gym-primary transition-colors">
                  <Upload className="w-8 h-8 text-gym-muted mb-2" />
                  <span className="text-sm text-gym-muted">{comprobante ? comprobante.name : "Adjuntar imagen o PDF"}</span>
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
                className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text placeholder:text-gym-muted focus:outline-none focus:ring-2 focus:ring-gym-primary resize-none h-20"
              />
            </div>

            {/* Fecha de pago */}
            <div>
              <label className="block text-sm font-medium text-gym-muted mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Fecha de pago
              </label>
              <input
                type="date"
                value={formData.fecha_pago}
                onChange={(e) => setFormData({ ...formData, fecha_pago: e.target.value })}
                className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary"
              />
              <p className="text-xs text-gym-muted mt-1">Puede editarse mientras el pago esté pendiente</p>
            </div>

            {/* Total */}
            <div className="p-4 bg-gym-bg rounded-xl neon-border">
              <div className="flex items-center justify-between">
                <span className="text-gym-muted">Total a pagar:</span>
                <span className="text-2xl font-bold text-gym-text neon-text">{formatCurrency(montoTotal)}</span>
              </div>
              <div className="text-xs text-gym-muted mt-2 space-y-1">
                {formData.pagar_inscripcion && !inscripcionPagada && gymConfig && (
                  <p>Inscripción: {formatCurrency(getMontoByMetodo(formData.metodo_pago, "inscripcion"))}</p>
                )}
                {formData.pagar_mensualidad && formData.meses.length > 0 && (
                  <p>Mensualidad: {formData.meses.length} mes(es) × {formatCurrency(getMontoByMetodo(formData.metodo_pago, "mensual"))}</p>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-gym-danger text-center bg-gym-danger/10 p-2 rounded-xl">{error}</p>}

            {/* Desktop button */}
            <Button
              id="form-submit-btn"
              type="submit"
              className="hidden sm:flex"
              loading={loading}
              disabled={
                (isAdmin && !miembroSeleccionado) ||
                (!formData.pagar_inscripcion && !formData.pagar_mensualidad) ||
                (formData.pagar_mensualidad && formData.meses.length === 0) ||
                montoTotal === 0
              }
            >
              {isAdmin && formData.estado_pago === "aprobado" ? "Registrar y Aprobar Pago" : "Enviar Pago"}
            </Button>
          </form>
          )}

          {/* Mobile floating button */}
          <button
            onClick={() => {
              const form = document.getElementById("pago-form") as HTMLFormElement | null;
              form?.requestSubmit();
            }}
            disabled={
              loading ||
              (isAdmin && !miembroSeleccionado) ||
              (!formData.pagar_inscripcion && !formData.pagar_mensualidad) ||
              (formData.pagar_mensualidad && formData.meses.length === 0) ||
              montoTotal === 0
            }
            className="sm:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gym-primary text-gym-bg shadow-lg shadow-gym-primary/30 flex items-center justify-center disabled:opacity-40 disabled:shadow-none active:scale-95 transition-all"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-gym-bg border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-6 h-6" />
            )}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
