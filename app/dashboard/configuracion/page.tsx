"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { configService } from "@/lib/services/config/config.service";
import { Save, Building2, User, CreditCard, Clock, Globe } from "lucide-react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { GymConfig, MetodoPagoConfig } from "@/lib/types";

const metodoLabels: Record<string, { label: string; icon: string; alwaysOn?: boolean }> = {
  efectivo: { label: "Efectivo", icon: "💵", alwaysOn: true },
  bs: { label: "Bolívares", icon: "🇻🇪" },
  binance: { label: "Binance USDT", icon: "🟡" },
  transferencia: { label: "Transferencia", icon: "🏦" },
};

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Partial<GymConfig>>({});
  const [metodos, setMetodos] = useState<MetodoPagoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [localTime, setLocalTime] = useState("");
  const [localCountry, setLocalCountry] = useState("");

  useEffect(() => {
    loadData();
    detectDevice();
  }, []);

  const detectDevice = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz });
    setLocalTime(timeStr);

    try {
      const locale = navigator.language || "es";
      const region = new Intl.DateTimeFormat(locale, { timeZone: tz }).resolvedOptions().timeZone.split("/")[1] || "";
      setLocalCountry(region.replace(/_/g, " "));
    } catch {
      setLocalCountry(tz.split("/")[1] || tz);
    }
  };

  const loadData = async () => {
    try {
      const [configData, metodosData] = await Promise.all([
        configService.getConfig(),
        configService.getMetodosPago(),
      ]);
      if (configData) setConfig(configData);
      setMetodos(metodosData);
    } catch (error) {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await configService.updateConfig(config);
      showToast(messages.toast.configuracionGuardada, "success");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      showToast(messages.toast.configuracionError, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMetodo = async (metodo: MetodoPagoConfig) => {
    if (metodoLabels[metodo.metodo_pago]?.alwaysOn) return;
    try {
      const updated = await configService.updateMetodoPago(metodo.id, {
        habilitado: !metodo.habilitado,
      });
      setMetodos((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      showToast(messages.toast.metodoPagoActualizado, "success");
    } catch (error) {
      showToast(messages.toast.metodoPagoError, "error");
    }
  };

  const handleUpdateMonto = async (metodo: MetodoPagoConfig, field: "monto_mensual" | "monto_inscripcion", value: number) => {
    try {
      const updated = await configService.updateMetodoPago(metodo.id, { [field]: value });
      setMetodos((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (error) {
      showToast(messages.toast.metodoPagoError, "error");
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
    <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn relative">
      <LoadingOverlay show={saving} message="Guardando configuración..." />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gym-primary/5 rounded-full blur-3xl animate-pulse" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Configuración</h1>
          <p className="text-gym-muted text-sm">Personaliza tu gimnasio</p>
        </div>
        <Button onClick={handleSaveConfig} loading={saving} className="hidden sm:flex">
          <Save className="w-4 h-4 mr-2" /> Guardar
        </Button>
      </div>

      {/* Mobile floating save button */}
      <button
        onClick={handleSaveConfig}
        disabled={saving}
        className="sm:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gym-success/80 text-white shadow-lg shadow-gym-success/20 flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all"
      >
        {saving ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Save className="w-6 h-6" />
        )}
      </button>

      {success && (
        <div className="p-4 bg-gym-success/20 border border-gym-success/50 rounded-xl text-gym-success text-center">
          Configuración guardada correctamente
        </div>
      )}

      {/* Datos del Gym */}
      <Card className="neon-card relative z-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gym-primary" /> Datos del Gym
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="Nombre del Gym *" placeholder="Mi Gimnasio" value={config.nombre_gym || ""} onChange={(e) => setConfig({ ...config, nombre_gym: e.target.value })} required />
          <Input label="Dirección" placeholder="Av. Principal #123" value={config.direccion || ""} onChange={(e) => setConfig({ ...config, direccion: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Teléfono" placeholder="+52 55 1234 5678" value={config.telefono || ""} onChange={(e) => setConfig({ ...config, telefono: e.target.value })} />
            <Input label="Email de contacto" placeholder="contacto@miGym.com" type="email" value={config.email_contacto || ""} onChange={(e) => setConfig({ ...config, email_contacto: e.target.value })} />
          </div>
          <Input label="Horario" placeholder="Lun-Vie 6am-10pm" value={config.horario || ""} onChange={(e) => setConfig({ ...config, horario: e.target.value })} />
          <Input label="Máximo de miembros" type="number" placeholder="50" value={config.max_miembros || ""} onChange={(e) => setConfig({ ...config, max_miembros: parseInt(e.target.value) || 0 })} min="1" />
        </CardContent>
      </Card>

      {/* Propietario */}
      <Card className="neon-card relative z-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-gym-primary" /> Propietario
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="Nombre del propietario *" placeholder="Tu nombre" value={config.dueno_nombre || ""} onChange={(e) => setConfig({ ...config, dueno_nombre: e.target.value })} required />
          <Input label="Correo del propietario *" placeholder="tu@email.com" type="email" value={config.dueno_email || ""} onChange={(e) => setConfig({ ...config, dueno_email: e.target.value })} required />
          <Input label="Teléfono" placeholder="+52 55 9876 5432" value={config.dueno_telefono || ""} onChange={(e) => setConfig({ ...config, dueno_telefono: e.target.value })} />
        </CardContent>
      </Card>

      {/* Métodos de Pago */}
      <Card className="neon-card relative z-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gym-secondary" /> Métodos de Pago
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gym-muted">Configura los métodos de pago aceptados y sus montos.</p>

          {metodos.map((metodo) => {
            const info = metodoLabels[metodo.metodo_pago] || { label: metodo.metodo_pago, icon: "💳" };
            const isAlwaysOn = info.alwaysOn;
            return (
              <div
                key={metodo.id}
                className={`p-4 rounded-xl border transition-all ${metodo.habilitado ? "bg-gym-bg border-gym-border/50" : "bg-gym-bg/30 border-gym-border/20 opacity-60"}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{info.icon}</span>
                    <div>
                      <p className="font-medium text-gym-text">{info.label}</p>
                      {isAlwaysOn && <p className="text-xs text-gym-muted">Siempre habilitado</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isAlwaysOn}
                    onClick={() => handleToggleMetodo(metodo)}
                    className={`w-11 h-6 rounded-full flex items-center px-1 transition-all ${
                      metodo.habilitado ? "bg-gym-primary justify-end" : "bg-gym-surface justify-start"
                    } ${isAlwaysOn ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                  >
                    <div className={`w-5 h-5 rounded-full transition-all ${metodo.habilitado ? "bg-white" : "bg-gym-border"}`} />
                  </button>
                </div>
                {metodo.habilitado && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label={`Mensualidad`}
                      type="number"
                      placeholder="0"
                      value={metodo.monto_mensual || ""}
                      onChange={(e) => handleUpdateMonto(metodo, "monto_mensual", parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                    />
                    <Input
                      label={`Inscripción`}
                      type="number"
                      placeholder="0"
                      value={metodo.monto_inscripcion || ""}
                      onChange={(e) => handleUpdateMonto(metodo, "monto_inscripcion", parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Zona Horaria y Moneda */}
      <Card className="neon-card relative z-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-gym-warning" /> Zona Horaria y Moneda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-gym-bg rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-gym-primary" />
                <p className="text-xs text-gym-muted">Hora local</p>
              </div>
              <p className="text-lg font-semibold text-gym-text">{localTime}</p>
              <p className="text-xs text-gym-muted">{localCountry}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gym-muted mb-2">Moneda</label>
              <select value={config.moneda || "USDT"} onChange={(e) => setConfig({ ...config, moneda: e.target.value })} className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary">
                <option value="USDT">USDT - Tether</option>
                <option value="USD">USD - Dólar</option>
                <option value="MXN">MXN - Peso Mexicano</option>
                <option value="COP">COP - Peso Colombiano</option>
                <option value="VES">VES - Bolívar</option>
                <option value="EUR">EUR - Euro</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
