"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { configService, METODOS_PAGO_DEFAULT } from "@/lib/services/config/config.service";
import { createClient } from "@/lib/supabase/client";
import { Save, Building2, User, CreditCard, Upload, Dumbbell, Trash2 } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { messages } from "@/lib/messages";
import type { GymConfig, MetodoPago, PaymentMethod } from "@/lib/types";

const metodoLabels: Record<MetodoPago, { label: string; icon: string; locked?: boolean }> = {
  efectivo: { label: "Efectivo", icon: "💵" },
  bs: { label: "Bolívares", icon: "🇻🇪", locked: true },
  binance: { label: "Binance USDT", icon: "🟡", locked: true },
};

function buildMetodosState(dbRecords: PaymentMethod[]): PaymentMethod[] {
  const dbMap = new Map(dbRecords.map((r) => [r.payment_method, r]));
  return METODOS_PAGO_DEFAULT.map((mp) => {
    const existing = dbMap.get(mp);
    return existing || {
      id: "",
      payment_method: mp,
      amount_monthly: 0,
      amount_inscription: 0,
      is_active: mp === "efectivo",
      effective_from: null,
      effective_to: null,
      created_at: "",
      updated_at: "",
    };
  });
}

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Partial<GymConfig>>({});
  const [metodos, setMetodos] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const metodosRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const [configData, metodosData] = await Promise.all([
        configService.getConfig(),
        configService.getMetodosPago(),
      ]);
      if (configData) setConfig(configData);
      setMetodos(buildMetodosState(metodosData));
    } catch {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const handleSaveConfig = async () => {
    const enabledMetodos = metodos.filter((m) => m.is_active);
    const hasPositiveAmount = enabledMetodos.some(
      (m) => (m.amount_monthly > 0 || m.amount_inscription > 0)
    );
    if (!hasPositiveAmount) {
      showToast(messages.configuracion.metodoRequiereMonto, "error");
      metodosRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSaving(true);
    try {
      await configService.updateConfig(config);
      await configService.saveMetodosPago(metodos);
      showToast(messages.toast.configuracionGuardada, "success");
      window.dispatchEvent(new Event("config:updated"));
    } catch {
      showToast(messages.toast.configuracionError, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMetodo = (metodoPago: MetodoPago) => {
    // eslint-disable-next-line security/detect-object-injection
    const info = metodoLabels[metodoPago];
    if (info?.locked) return;
    setMetodos((prev) =>
      prev.map((m) =>
        m.payment_method === metodoPago
          ? { ...m, is_active: !m.is_active }
          : { ...m, is_active: false }
      )
    );
  };

  const handleUpdateMonto = (metodoPago: MetodoPago, field: "amount_monthly" | "amount_inscription", value: number) => {
    setMetodos((prev) =>
      prev.map((m) =>
        m.payment_method === metodoPago ? { ...m, [field]: value } : m
      )
    );
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Solo se permiten imágenes", "error");
      return;
    }
    setUploadingLogo(true);
    try {
      const supabase = createClient();
      const fileExt = file.name.split(".").pop();
      const fileName = `logo.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("logos").getPublicUrl(fileName);
      const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setConfig({ ...config, logo_url: logoUrl });
      await configService.updateConfig({ logo_url: logoUrl });
      showToast("Logo actualizado", "success");
    } catch {
      showToast("Error al subir logo", "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    try {
      const supabase = createClient();
      await supabase.storage.from("logos").remove(["logo.png"]).catch(() => {});
      await supabase.storage.from("logos").remove(["logo.jpg"]).catch(() => {});
      setConfig({ ...config, logo_url: "" });
      await configService.updateConfig({ logo_url: "" });
      showToast("Logo eliminado", "success");
    } catch {
      showToast("Error al eliminar logo", "error");
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
    <div className="space-y-4 animate-fadeIn relative">
      <LoadingOverlay show={saving} message={messages.common.guardando} />
      <div className="absolute top-0 right-0 w-72 h-72 bg-gym-primary/5 rounded-full blur-3xl animate-pulse" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Configuración</h1>
          <p className="text-gym-muted text-sm">Ajustes generales del gym</p>
        </div>
        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-gym-primary text-gym-bg rounded-xl font-medium hover:bg-gym-primary/90 transition-all disabled:opacity-50"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-gym-bg border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Guardar
        </button>
      </div>

      {/* Datos del Gym */}
      <Card className="neon-card relative z-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gym-primary" /> {messages.configuracion.datosDelGym}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-xl bg-gym-surface border-2 border-dashed border-gym-border flex items-center justify-center overflow-hidden">
                {config.logo_url ? (
                  <Image src={config.logo_url} alt="Logo" width={80} height={80} className="w-full h-full object-cover" />
                ) : (
                  <Dumbbell className="w-8 h-8 text-gym-muted" />
                )}
              </div>
              {config.logo_url && (
                <button
                  onClick={handleDeleteLogo}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-gym-danger text-white rounded-full flex items-center justify-center hover:bg-gym-danger/80 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gym-muted mb-2">Logo del Gym</label>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="flex items-center gap-2 px-4 py-2 bg-gym-surface border border-gym-border rounded-xl text-sm text-gym-text hover:bg-gym-border/50 transition-colors disabled:opacity-50"
              >
                {uploadingLogo ? (
                  <div className="w-4 h-4 border-2 border-gym-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {config.logo_url ? "Cambiar" : "Subir logo"}
              </button>
            </div>
          </div>

          <Input label={`${messages.configuracion.gymName} *`} placeholder="Mi Gym" value={config.gym_name || ""} onChange={(e) => setConfig({ ...config, gym_name: e.target.value })} required />
          <Input label={messages.configuracion.maxMembers} type="number" placeholder="100" value={config.max_members || ""} onChange={(e) => setConfig({ ...config, max_members: parseInt(e.target.value) || 0 })} min="1" />
          <Input label={messages.configuracion.address} placeholder="" value={config.address || ""} onChange={(e) => setConfig({ ...config, address: e.target.value })} />
          <Input label={messages.configuracion.phoneNumber} placeholder="+584261234567" value={config.phone_number || ""} onChange={(e) => setConfig({ ...config, phone_number: e.target.value })} />
          <Input label={messages.configuracion.contactEmail} placeholder="gym@email.com" type="email" value={config.contact_email || ""} onChange={(e) => setConfig({ ...config, contact_email: e.target.value })} />
          <Input label={messages.configuracion.schedule} placeholder="Lun-Vie 6am-10pm" value={config.schedule || ""} onChange={(e) => setConfig({ ...config, schedule: e.target.value })} />
        </CardContent>
      </Card>

      {/* Datos del Propietario */}
      <Card className="neon-card relative z-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-gym-secondary" /> {messages.configuracion.propietario}
          </CardTitle>
          <p className="text-xs text-gym-muted -mt-2">{messages.configuracion.propietarioDesc}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label={`${messages.configuracion.ownerName} *`} placeholder="Tu nombre" value={config.owner_name || ""} onChange={(e) => setConfig({ ...config, owner_name: e.target.value })} required />
          <Input label={`${messages.configuracion.ownerEmail} *`} placeholder="tu@email.com" type="email" value={config.owner_email || ""} onChange={(e) => setConfig({ ...config, owner_email: e.target.value })} required />
          <Input label={messages.configuracion.ownerPhone} placeholder="+584261234567" value={config.owner_phone || ""} onChange={(e) => setConfig({ ...config, owner_phone: e.target.value })} />
        </CardContent>
      </Card>

      {/* Métodos de Pago */}
      <Card ref={metodosRef} className="neon-card relative z-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gym-secondary" /> {messages.configuracion.metodosPago}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gym-muted">{messages.configuracion.configuraMetodos}</p>

          {metodos.map((metodo) => {
            const info = metodoLabels[metodo.payment_method];
            const isLocked = info?.locked;
            const isDisabled = isLocked;
            return (
              <div
                key={metodo.payment_method}
                className={`p-4 rounded-xl border transition-all ${
                  metodo.is_active
                    ? "bg-gym-bg border-gym-border/50"
                    : "bg-gym-bg/30 border-gym-border/30"
                } ${isLocked ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{info?.icon}</span>
                    <div>
                      <p className="font-medium text-gym-text">{info?.label}</p>
                      {isLocked && <p className="text-xs text-gym-muted">Próximamente</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleToggleMetodo(metodo.payment_method)}
                    className={`w-11 h-6 rounded-full flex items-center px-1 transition-all ${
                      metodo.is_active ? "bg-gym-primary justify-end" : "bg-gym-border justify-start"
                    } ${isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:opacity-90"}`}
                  >
                    <div className={`w-5 h-5 rounded-full transition-all ${metodo.is_active ? "bg-white" : "bg-gym-muted"}`} />
                  </button>
                </div>
                {metodo.is_active && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Mensualidad"
                      type="number"
                      placeholder="0"
                      value={metodo.amount_monthly || ""}
                      onChange={(e) => handleUpdateMonto(metodo.payment_method, "amount_monthly", parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                    />
                    <Input
                      label="Inscripción"
                      type="number"
                      placeholder="0"
                      value={metodo.amount_inscription || ""}
                      onChange={(e) => handleUpdateMonto(metodo.payment_method, "amount_inscription", parseFloat(e.target.value) || 0)}
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

      {/* Modo de Cobro */}
      <Card className="neon-card relative z-10">
        <CardContent className="p-4">
          <div>
            <span className="text-sm font-medium text-gym-text">{messages.notificaciones.modoCobro}</span>
            <p className="text-xs text-gym-muted mb-3">{messages.notificaciones.modoCobroDesc}</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="modo_cobro"
                  value="dia_uno"
                  checked={(config.billing_mode || "dia_uno") === "dia_uno"}
                  onChange={() => setConfig({ ...config, billing_mode: "dia_uno" })}
                  className="w-4 h-4 text-gym-primary focus:ring-gym-primary"
                />
                <span className="text-sm text-gym-text">{messages.notificaciones.modoCobroDiaUno}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="modo_cobro"
                  value="fecha_inscripcion"
                  checked={config.billing_mode === "fecha_inscripcion"}
                  onChange={() => setConfig({ ...config, billing_mode: "fecha_inscripcion" })}
                  className="w-4 h-4 text-gym-primary focus:ring-gym-primary"
                />
                <span className="text-sm text-gym-text">{messages.notificaciones.modoCobroFechaInscripcion}</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Desktop bottom save button */}
      <div className="hidden sm:flex justify-end">
        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-gym-primary text-gym-bg rounded-xl font-medium hover:bg-gym-primary/90 transition-all disabled:opacity-50"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-gym-bg border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Guardar
        </button>
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
    </div>
  );
}
