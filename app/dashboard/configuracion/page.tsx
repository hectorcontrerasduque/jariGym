"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { configService } from "@/lib/services/config/config.service";
import { Save, Building2, User, DollarSign, CreditCard, Clock, Globe } from "lucide-react";
import type { GymConfig } from "@/lib/types";

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Partial<GymConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [localTime, setLocalTime] = useState("");
  const [localCountry, setLocalCountry] = useState("");

  useEffect(() => {
    loadConfig();
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

  const loadConfig = async () => {
    try {
      const data = await configService.getConfig();
      if (data) setConfig(data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await configService.updateConfig(config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
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
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gym-primary/5 rounded-full blur-3xl animate-pulse" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Configuración</h1>
          <p className="text-gym-muted text-sm">Personaliza tu gimnasio</p>
        </div>
        <Button onClick={handleSave} loading={saving}>
          <Save className="w-4 h-4 mr-2" /> Guardar
        </Button>
      </div>

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

      {/* Métodos de Pago + Montos fusionados */}
      <Card className="neon-card relative z-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gym-secondary" /> Métodos de Pago y Montos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gym-muted">Efectivo siempre habilitado. Los montos se aplican por método de pago.</p>

          {/* Efectivo */}
          <div className="p-4 bg-gym-bg rounded-xl border border-gym-border/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">💵</span>
                <div>
                  <p className="font-medium text-gym-text">Efectivo</p>
                  <p className="text-xs text-gym-muted">Siempre habilitado</p>
                </div>
              </div>
              <div className="w-11 h-6 bg-gym-primary rounded-full flex items-center justify-end px-1">
                <div className="w-5 h-5 bg-white rounded-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Mensualidad ($)" type="number" placeholder="29.99" value={config.monto_mensual || ""} onChange={(e) => setConfig({ ...config, monto_mensual: parseFloat(e.target.value) || 0 })} min="0" step="0.01" />
              <Input label="Inscripción ($)" type="number" placeholder="0.00" value={config.monto_inscripcion || ""} onChange={(e) => setConfig({ ...config, monto_inscripcion: parseFloat(e.target.value) || 0 })} min="0" step="0.01" />
            </div>
          </div>

          {/* BS */}
          <div className={`p-4 rounded-xl border transition-all ${config.acepta_bs ? "bg-gym-bg border-gym-border/50" : "bg-gym-bg/30 border-gym-border/20 opacity-60"}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">🇻🇪</span>
                <p className="font-medium text-gym-text">Bolívares</p>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, acepta_bs: !config.acepta_bs })}
                className={`w-11 h-6 rounded-full flex items-center px-1 transition-all ${config.acepta_bs ? "bg-gym-primary justify-end" : "bg-gym-surface justify-start"}`}
              >
                <div className={`w-5 h-5 rounded-full transition-all ${config.acepta_bs ? "bg-white" : "bg-gym-border"}`} />
              </button>
            </div>
            {config.acepta_bs && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Mensualidad (Bs)" type="number" placeholder="0" value={config.monto_mensual_bs || ""} onChange={(e) => setConfig({ ...config, monto_mensual_bs: parseFloat(e.target.value) || 0 })} min="0" />
                <Input label="Inscripción (Bs)" type="number" placeholder="0" value={config.monto_inscripcion_bs || ""} onChange={(e) => setConfig({ ...config, monto_inscripcion_bs: parseFloat(e.target.value) || 0 })} min="0" />
              </div>
            )}
          </div>

          {/* Binance */}
          <div className={`p-4 rounded-xl border transition-all ${config.acepta_binance ? "bg-gym-bg border-gym-border/50" : "bg-gym-bg/30 border-gym-border/20 opacity-60"}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">🟡</span>
                <p className="font-medium text-gym-text">Binance</p>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, acepta_binance: !config.acepta_binance })}
                className={`w-11 h-6 rounded-full flex items-center px-1 transition-all ${config.acepta_binance ? "bg-gym-primary justify-end" : "bg-gym-surface justify-start"}`}
              >
                <div className={`w-5 h-5 rounded-full transition-all ${config.acepta_binance ? "bg-white" : "bg-gym-border"}`} />
              </button>
            </div>
            {config.acepta_binance && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Mensualidad (USDT)" type="number" placeholder="0" value={config.monto_mensual_binance || ""} onChange={(e) => setConfig({ ...config, monto_mensual_binance: parseFloat(e.target.value) || 0 })} min="0" />
                <Input label="Inscripción (USDT)" type="number" placeholder="0" value={config.monto_inscripcion_binance || ""} onChange={(e) => setConfig({ ...config, monto_inscripcion_binance: parseFloat(e.target.value) || 0 })} min="0" />
              </div>
            )}
          </div>

          {/* Transferencia */}
          <div className={`p-4 rounded-xl border transition-all ${config.acepta_transferencia ? "bg-gym-bg border-gym-border/50" : "bg-gym-bg/30 border-gym-border/20 opacity-60"}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">🏦</span>
                <p className="font-medium text-gym-text">Transferencia</p>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, acepta_transferencia: !config.acepta_transferencia })}
                className={`w-11 h-6 rounded-full flex items-center px-1 transition-all ${config.acepta_transferencia ? "bg-gym-primary justify-end" : "bg-gym-surface justify-start"}`}
              >
                <div className={`w-5 h-5 rounded-full transition-all ${config.acepta_transferencia ? "bg-white" : "bg-gym-border"}`} />
              </button>
            </div>
            {config.acepta_transferencia && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Mensualidad ($)" type="number" placeholder="0" value={config.monto_mensual_transferencia || ""} onChange={(e) => setConfig({ ...config, monto_mensual_transferencia: parseFloat(e.target.value) || 0 })} min="0" />
                <Input label="Inscripción ($)" type="number" placeholder="0" value={config.monto_inscripcion_transferencia || ""} onChange={(e) => setConfig({ ...config, monto_inscripcion_transferencia: parseFloat(e.target.value) || 0 })} min="0" />
              </div>
            )}
          </div>
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
