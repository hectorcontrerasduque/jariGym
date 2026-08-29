"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatCurrency } from "@/lib/utils";
import { showToast } from "@/components/ui/toast";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { messages } from "@/lib/messages";
import {
  Save,
  Mail,
  Clock,
  CheckCircle,
} from "lucide-react";
import type { Profile } from "@/lib/types";
import Link from "next/link";

export default function PerfilPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    }>
      <PerfilContent />
    </Suspense>
  );
}

function PerfilContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get("user_id");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [formData, setFormData] = useState({
    nombre_completo: "",
    email: "",
    whatsapp: "",
    cedula: "",
    horario_entreno: "",
    hora_llegada: "--:--",
    hora_salida: "--:--",
    role: "" as Profile["role"],
    inscripcion_nota_admin: "",
    password: "",
    currentPassword: "",
  });

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        const profileUserId = user.id;
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", profileUserId)
          .single();

        if (!cancelled && data) {
          setCurrentUserRole(data.role || "");
          const isSuperAdmin = data.role === "super_admin";
          const targetId = isSuperAdmin && targetUserId ? targetUserId : profileUserId;

          if (targetId !== profileUserId) {
            const { data: targetData } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", targetId)
              .single();
            if (!cancelled && targetData) {
              setProfile(targetData);
              setFormData({
                nombre_completo: targetData.nombre_completo || "",
                email: targetData.email || "",
                whatsapp: targetData.whatsapp || "",
                cedula: targetData.cedula || "",
                horario_entreno: targetData.horario_entreno || "",
                hora_llegada: targetData.hora_llegada || "--:--",
                hora_salida: targetData.hora_salida || "--:--",
                role: targetData.role,
                inscripcion_nota_admin: targetData.inscripcion_nota_admin || "",
                password: "",
                currentPassword: "",
              });
            }
          } else {
            setProfile(data);
            setFormData({
              nombre_completo: data.nombre_completo || "",
              email: data.email || "",
              whatsapp: data.whatsapp || "",
              cedula: data.cedula || "",
              horario_entreno: data.horario_entreno || "",
              hora_llegada: data.hora_llegada || "--:--",
              hora_salida: data.hora_salida || "--:--",
              role: data.role,
              inscripcion_nota_admin: data.inscripcion_nota_admin || "",
              password: "",
              currentPassword: "",
            });
          }
        }
      } catch {
        if (!cancelled) showToast(messages.toast.errorCargaDatos, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadProfile();
    return () => { cancelled = true; };
   
  }, [targetUserId, router]);

  const handleSave = async () => {
    if (!formData.email.trim()) {
      showToast(messages.miembros.correoRequerido, "error");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      showToast("Formato de correo inválido", "error");
      return;
    }

    let cedulaToSend = formData.cedula || null;
    if (cedulaToSend && !cedulaToSend.startsWith("V-") && !cedulaToSend.startsWith("E-")) {
      cedulaToSend = `V-${cedulaToSend}`;
    }

    let whatsappToSend = formData.whatsapp || "";
    if (whatsappToSend && !whatsappToSend.startsWith("+")) {
      whatsappToSend = `+58${whatsappToSend}`;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: targetUserId || undefined,
          updates: {
            nombre_completo: formData.nombre_completo || profile!.nombre_completo || "Sin nombre",
            email: formData.email,
            whatsapp: whatsappToSend,
            cedula: cedulaToSend,
            horario_entreno: formData.horario_entreno || null,
            hora_llegada: formData.hora_llegada || null,
            hora_salida: formData.hora_salida || null,
            role: currentUserRole === "super_admin" ? formData.role : undefined,
            inscripcion_nota_admin: currentUserRole === "super_admin" ? formData.inscripcion_nota_admin || null : undefined,
          },
          password: formData.password || undefined,
          currentPassword: formData.currentPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      setProfile(data.profile);
      setFormData((prev) => ({ ...prev, password: "", currentPassword: "" }));
      showToast(messages.toast.perfilGuardado, "success");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const msg = raw.toLowerCase().includes("contraseña") ? raw : messages.toast.perfilError;
      showToast(msg, "error");
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

  if (!profile) return null;

  const isAdmin = profile.role === "super_admin";

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn relative">
      <LoadingOverlay show={saving} message={messages.common.guardando} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Mi Perfil</h1>
          <p className="text-gym-muted text-sm">Edita tu información personal</p>
        </div>
        <Button onClick={handleSave} loading={saving} className="hidden sm:flex">
          <Save className="w-4 h-4 mr-2" /> Guardar
        </Button>
      </div>

      {/* Avatar + role + inscription status */}
      <Card className="neon-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Avatar src={profile.avatar_url} alt={profile.nombre_completo} size="lg" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gym-text">{profile.nombre_completo || "Sin nombre"}</h3>
              <p className="text-sm text-gym-muted">{profile.email}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant={isAdmin ? "primary" : "secondary"}>
                  {profile.role === "super_admin" ? "Super Admin" : "Miembro"}
                </Badge>
                {profile.inscripcion_pagada ? (
                  <Badge variant="success" className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Inscripción pagada
                  </Badge>
                ) : (
                  <Badge variant="warning" className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Inscripción pendiente
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal info */}
      <Card className="neon-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-gym-primary" />
            Información Personal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-gym-muted mb-1 block">Nombre completo (opcional)</label>
            <Input
              value={formData.nombre_completo}
              onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
              placeholder="Nombre completo"
            />
          </div>
          <div>
            <label className="text-xs text-gym-muted mb-1 block">Email <span className="text-gym-danger">*</span></label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@ejemplo.com"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gym-muted mb-1 block">Hora llegada (opcional solo referencial, hora militar)</label>
              <input
                type="time"
                value={formData.hora_llegada === "--:--" ? "" : formData.hora_llegada}
                onChange={(e) => setFormData({ ...formData, hora_llegada: e.target.value || "--:--" })}
                className="w-full px-3 py-2 rounded-xl border border-gym-border bg-gym-surface text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary/50"
              />
            </div>
            <div>
              <label className="text-xs text-gym-muted mb-1 block">Hora salida (opcional solo referencial, hora militar)</label>
              <input
                type="time"
                value={formData.hora_salida === "--:--" ? "" : formData.hora_salida}
                onChange={(e) => setFormData({ ...formData, hora_salida: e.target.value || "--:--" })}
                className="w-full px-3 py-2 rounded-xl border border-gym-border bg-gym-surface text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary/50"
              />
            </div>
          </div>
          {!targetUserId && (
            <PasswordInput
              label="Contraseña actual (requerida para cambiar contraseña)"
              placeholder="Ingresa tu contraseña actual"
              value={formData.currentPassword}
              onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
            />
          )}
          <PasswordInput
            label="Nueva contraseña (opcional)"
            placeholder="Dejar vacío para no cambiar"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
          <div>
            <label className="text-xs text-gym-muted mb-1 block">WhatsApp (opcional)</label>
            <Input
              value={formData.whatsapp}
              onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
              placeholder="+58 412 1234567"
            />
          </div>
          <div>
            <label className="text-xs text-gym-muted mb-1 block">Cédula (opcional)</label>
            <Input
              value={formData.cedula}
              onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
              placeholder="V-12345678"
            />
          </div>
          {isAdmin && (
            <div>
              <label className="text-xs text-gym-muted mb-1 block">Nota de inscripción (admin)</label>
              <textarea
                value={formData.inscripcion_nota_admin}
                onChange={(e) => setFormData({ ...formData, inscripcion_nota_admin: e.target.value })}
                placeholder="Notas internas sobre inscripción..."
                rows={2}
                className="w-full px-3 py-2 bg-gym-surface border border-gym-border rounded-xl text-sm text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary/50 resize-none"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit info */}
      <Card className="neon-card">
        <CardHeader>
          <CardTitle className="text-sm text-gym-muted">Información de auditoría</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gym-muted">Creado</p>
              <p className="text-gym-text">{profile.created_at ? formatDateTime(profile.created_at) : "—"}</p>
            </div>
            <div>
              <p className="text-gym-muted">Actualizado</p>
              <p className="text-gym-text">{profile.updated_at ? formatDateTime(profile.updated_at) : "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PC save button at bottom */}
      <div className="hidden sm:flex justify-end">
        <Button onClick={handleSave} loading={saving}>
          <Save className="w-4 h-4 mr-2" /> Guardar
        </Button>
      </div>

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

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}
