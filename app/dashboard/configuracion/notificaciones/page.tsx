"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notificacionesService } from "@/lib/services/notificaciones/notificaciones.service";
import { Save, Bell, MessageCircle, Mail } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { NotificacionesConfig } from "@/lib/types";

export default function NotificacionesPage() {
  const [config, setConfig] = useState<Partial<NotificacionesConfig>>({
    whatsapp_enabled: true,
    email_enabled: true,
    recordatorio_dias_antes: 3,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await notificacionesService.getConfig();
      if (data) setConfig(data);
    } catch (error) {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await notificacionesService.updateConfig(config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      showToast(messages.toast.notificacionesError, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text">
            Configuración de Notificaciones
          </h1>
          <p className="text-gym-muted">Elige cómo quieres recibir notificaciones</p>
        </div>
        <Button onClick={handleSave} loading={saving}>
          <Save className="w-4 h-4 mr-2" />
          Guardar
        </Button>
      </div>

      {success && (
        <div className="p-4 bg-gym-success/20 border border-gym-success/50 rounded-xl text-gym-success text-center">
          Configuración guardada correctamente
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gym-primary" />
            Canales de Notificación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-gym-bg rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-gym-text">WhatsApp</p>
                <p className="text-sm text-gym-muted">Recibe notificaciones por WhatsApp</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={config.whatsapp_enabled || false}
                onChange={(e) =>
                  setConfig({ ...config, whatsapp_enabled: e.target.checked })
                }
              />
              <div className="w-11 h-6 bg-gym-surface peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gym-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gym-primary"></div>
            </label>
          </div>

          {config.whatsapp_enabled && (
            <Input
              label="Número de WhatsApp"
              placeholder="+52 55 1234 5678"
              value={config.whatsapp_number || ""}
              onChange={(e) =>
                setConfig({ ...config, whatsapp_number: e.target.value })
              }
            />
          )}

          <div className="flex items-center justify-between p-4 bg-gym-bg rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="font-medium text-gym-text">Email</p>
                <p className="text-sm text-gym-muted">Recibe notificaciones por email</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={config.email_enabled || false}
                onChange={(e) =>
                  setConfig({ ...config, email_enabled: e.target.checked })
                }
              />
              <div className="w-11 h-6 bg-gym-surface peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gym-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gym-primary"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gym-warning" />
            Recordatorios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            label="Días antes de vencer para recordar"
            placeholder="3"
            value={config.recordatorio_dias_antes || 3}
            onChange={(e) =>
              setConfig({
                ...config,
                recordatorio_dias_antes: parseInt(e.target.value) || 3,
              })
            }
            min="1"
            max="30"
          />
          <p className="text-sm text-gym-muted mt-2">
            Se enviará un recordatorio al miembro cuando falten estos días para vencer su membresía
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
