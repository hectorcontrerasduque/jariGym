"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notificacionesService } from "@/lib/services/notificaciones/notificaciones.service";
import { configService } from "@/lib/services/config/config.service";
import {
  Save,
  Users,
  Clock,
  BarChart3,
  Activity,
  Play,
  Stethoscope,
  CheckCircle,
  XCircle,
  Send,
} from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { messages } from "@/lib/messages";
import type { GymConfig, NotificacionConfig, NotificacionLog } from "@/lib/types";

const tipoLabels: Record<string, { label: string; icon: React.ReactNode; desc: string }> = {
  miembros_deudores: {
    label: "Miembros Deudores",
    icon: <Users className="w-5 h-5 text-red-500" />,
    desc: "Notifica a miembros con pagos pendientes",
  },
  recordatorio_pago: {
    label: "Recordatorio de Pago",
    icon: <Clock className="w-5 h-5 text-yellow-500" />,
    desc: "Avisa antes de que venza la membresia",
  },
  resumen_dueno: {
    label: "Resumen al Propietario",
    icon: <BarChart3 className="w-5 h-5 text-blue-500" />,
    desc: "Resumen de pagos para el propietario",
  },
  estatus_sistema: {
    label: "Estado del Sistema",
    icon: <Activity className="w-5 h-5 text-green-500" />,
    desc: "Reporte tecnico del sistema",
  },
};

const mesesNombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function NotificacionesPage() {
  const [gymConfig, setGymConfig] = useState<Partial<GymConfig>>({});
  const [configs, setConfigs] = useState<NotificacionConfig[]>([]);
  const [historial, setHistorial] = useState<NotificacionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executingTipo, setExecutingTipo] = useState<string | null>(null);
  const [diagnosticing, setDiagnosticing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configData, configsData, historialData] = await Promise.all([
        configService.getConfig(),
        notificacionesService.getNotificacionesConfig(),
        notificacionesService.getHistorial(4),
      ]);
      if (configData) setGymConfig(configData);
      setConfigs(configsData);
      setHistorial(historialData);
    } catch (error) {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleConfig = (id: string, field: string, value: boolean) => {
    setConfigs(configs.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleDiasPrevioChange = (id: string, value: number) => {
    setConfigs(configs.map((c) => (c.id === id ? { ...c, dias_previo: value } : c)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await configService.updateConfig({
        notificaciones_enabled: gymConfig.notificaciones_enabled,
      } as Partial<GymConfig>);

      for (const config of configs) {
        await notificacionesService.updateNotificacionConfig(config.id, {
          habilitado: config.habilitado,
          frecuencia_semanal: config.frecuencia_semanal,
          frecuencia_quincenal: config.frecuencia_quincenal,
          frecuencia_mensual: config.frecuencia_mensual,
          dias_previo: config.dias_previo,
          notificar_por_email: config.notificar_por_email,
          notificar_por_whatsapp: false,
        });
      }

      showToast(messages.notificaciones.guardada, "success");
    } catch (error) {
      showToast(messages.notificaciones.errorGuardar, "error");
    } finally {
      setSaving(false);
    }
  };

  const refreshHistorial = async () => {
    const historialData = await notificacionesService.getHistorial(4);
    setHistorial(historialData);
  };

  const handleEjecutarAhora = async () => {
    if (!confirm("¿Ejecutar notificaciones ahora? Se enviarán los correos pendientes según la frecuencia configurada.")) return;
    setExecuting(true);
    try {
      const resultado = await notificacionesService.procesarTodasLasNotificaciones();
      if (resultado.errores > 0) {
        showToast(messages.notificaciones.ejecutado + " (" + resultado.errores + " errores)", "warning");
      } else {
        showToast(messages.notificaciones.ejecutado, "success");
      }
      await refreshHistorial();
    } catch (error) {
      showToast(messages.notificaciones.errorEjecutar, "error");
    } finally {
      setExecuting(false);
    }
  };

  const handleEjecutarTipo = async (tipo: string) => {
    setExecutingTipo(tipo);
    try {
      const resultado = await notificacionesService.procesarTodasLasNotificaciones(tipo);
      if (resultado.errores > 0) {
        showToast(`${tipoLabels[tipo]?.label}: ${resultado.enviados} enviados (${resultado.errores} errores)`, "warning");
      } else {
        showToast(`${tipoLabels[tipo]?.label}: ${resultado.enviados} notificación(es) enviada(s)`, "success");
      }
      await refreshHistorial();
    } catch (error) {
      showToast(messages.notificaciones.errorEjecutar, "error");
    } finally {
      setExecutingTipo(null);
    }
  };

  const handleDiagnostico = async () => {
    if (!confirm("¿Enviar diagnóstico? Se enviará un correo de prueba con el estado del sistema.")) return;
    setDiagnosticing(true);
    try {
      await notificacionesService.ejecutarDiagnostico();
      showToast(messages.notificaciones.diagnosticoEnviado, "success");
    } catch (error) {
      showToast(messages.notificaciones.errorDiagnostico, "error");
    } finally {
      setDiagnosticing(false);
    }
  };

  const isLoading = saving || executing || diagnosticing || executingTipo !== null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn relative">
      <LoadingOverlay show={isLoading} message={saving ? messages.common.guardando : executing || executingTipo ? "Enviando notificaciones..." : diagnosticing ? "Ejecutando diagnóstico..." : undefined} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">
            {messages.notificaciones.title}
          </h1>
          <p className="text-gym-muted text-sm">{messages.notificaciones.subtitle}</p>
        </div>
        <Button onClick={handleSave} loading={saving} className="hidden sm:flex">
          <Save className="w-4 h-4 mr-2" />
          {messages.notificaciones.guardar}
        </Button>
      </div>

      {/* Global toggle */}
      <Card className="neon-card relative z-10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gym-text">{messages.notificaciones.switchGlobal}</span>
              <p className="text-xs text-gym-muted">{messages.notificaciones.switchGlobalDesc}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={gymConfig.notificaciones_enabled || false}
                onChange={(e) => setGymConfig({ ...gymConfig, notificaciones_enabled: e.target.checked })}
              />
              <div className="w-11 h-6 bg-gym-surface peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gym-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gym-primary"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      {gymConfig.notificaciones_enabled && <>
        {configs.map((config) => {
          const info = tipoLabels[config.tipo_notificacion];
          return (
            <Card key={config.id} className="neon-card relative z-10">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {info.icon}
                    {info.label}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEjecutarTipo(config.tipo_notificacion)}
                    loading={executingTipo === config.tipo_notificacion}
                    className="text-xs"
                  >
                    <Send className="w-3 h-3 mr-1" />
                    Ejecutar
                  </Button>
                </CardTitle>
                <p className="text-sm text-gym-muted">{info.desc}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gym-bg rounded-xl">
                  <span className="text-sm font-medium text-gym-text">{messages.notificaciones.habilitado}</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={config.habilitado}
                      onChange={(e) => handleToggleConfig(config.id, "habilitado", e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gym-surface peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gym-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gym-primary"></div>
                  </label>
                </div>

                <div>
                  <p className="text-sm font-medium text-gym-text mb-2">{messages.notificaciones.frecuencia}</p>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { field: "frecuencia_semanal", label: messages.notificaciones.semanaS },
                      { field: "frecuencia_quincenal", label: messages.notificaciones.quincenalS },
                      { field: "frecuencia_mensual", label: messages.notificaciones.mensualS },
                    ].map((freq) => (
                      <label key={freq.field} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gym-border text-gym-primary focus:ring-gym-primary"
                          checked={config[freq.field as keyof NotificacionConfig] as boolean || false}
                          onChange={(e) => handleToggleConfig(config.id, freq.field, e.target.checked)}
                        />
                        <span className="text-sm text-gym-text">{freq.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {config.tipo_notificacion === "recordatorio_pago" && (
                  <div>
                    <p className="text-sm font-medium text-gym-text mb-1">{messages.notificaciones.diasPrevio}</p>
                    <p className="text-xs text-gym-muted mb-2">{messages.notificaciones.diasPrevioDesc}</p>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={config.dias_previo}
                      onChange={(e) => handleDiasPrevioChange(config.id, parseInt(e.target.value) || 3)}
                      className="w-20 px-3 py-2 bg-gym-surface border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary"
                    />
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium text-gym-text mb-2">{messages.notificaciones.canales}</p>
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-gym-border text-gym-primary focus:ring-gym-primary"
                        checked={config.notificar_por_email}
                        onChange={(e) => handleToggleConfig(config.id, "notificar_por_email", e.target.checked)}
                      />
                      <span className="text-sm text-gym-text">{messages.notificaciones.email}</span>
                    </label>
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gym-muted bg-gym-surface border border-gym-border rounded-lg opacity-60 cursor-not-allowed">
                      {messages.notificaciones.whatsapp}
                      <span className="text-[10px] bg-gym-border/50 px-1.5 py-0.5 rounded-md ml-1">Próximamente</span>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Acciones */}
        <Card className="neon-card relative z-10">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleEjecutarAhora} loading={executing} className="flex-1">
                <Play className="w-4 h-4 mr-2" />
                {messages.notificaciones.ejecutarAhora}
              </Button>
              <Button onClick={handleDiagnostico} loading={diagnosticing} className="flex-1">
                <Stethoscope className="w-4 h-4 mr-2" />
                {messages.notificaciones.diagnostico}
              </Button>
            </div>
            <p className="text-xs text-gym-muted">
              <strong>Ejecutar Notificaciones Ahora:</strong> Revisa la frecuencia de cada notificación habilitada y envía los correos pendientes inmediatamente.
            </p>
            <p className="text-xs text-gym-muted">
              <strong>Ejecutar Diagnóstico:</strong> Envía un correo de prueba con un reporte completo del estado del sistema para verificar que el email funciona correctamente.
            </p>
          </CardContent>
        </Card>

        {/* Historial */}
        <Card className="neon-card relative z-10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{messages.notificaciones.historial}</CardTitle>
          </CardHeader>
          <CardContent>
            {historial.length === 0 ? (
              <p className="text-gym-muted text-center py-8">{messages.notificaciones.sinRegistros}</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {historial.map((log) => {
                  const tipoConfig = log.notificacion_config;
                  const tipoInfo = tipoConfig ? tipoLabels[tipoConfig.tipo_notificacion] : null;
                  const fecha = new Date(log.fecha_hora_envio);
                  return (
                    <div key={log.id} className="flex items-center justify-between p-3 bg-gym-bg rounded-xl">
                      <div className="flex items-center gap-3 min-w-0">
                        {log.sin_problemas ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gym-text truncate">{tipoInfo?.label || tipoConfig?.tipo_notificacion}</p>
                          <p className="text-xs text-gym-muted">
                            {fecha.getDate()} {mesesNombres[fecha.getMonth()]} {fecha.getHours().toString().padStart(2, "0")}:{fecha.getMinutes().toString().padStart(2, "0")} · {log.miembros_notificados} miembro(s)
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </>}

      {/* Mobile floating save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="sm:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gym-success/80 text-white shadow-lg shadow-gym-success/20 flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all"
      >
        {saving ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Save className="w-6 h-6" />
        )}
      </button>
    </div>
  );
}
