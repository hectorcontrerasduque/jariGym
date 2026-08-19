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
  ArrowLeft,
  Save,
  Mail,
  Phone,
  CreditCard,
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
    role: "" as Profile["role"],
    notas_admin: "",
    password: "",
  });

  useEffect(() => {
    loadProfile();
  }, [targetUserId]);

  const loadProfile = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: currentProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      setCurrentUserRole(currentProfile?.role || "");

      const isSuperAdmin = currentProfile?.role === "super_admin";
      const profileUserId = isSuperAdmin && targetUserId ? targetUserId : user.id;

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileUserId)
        .single();
      if (data) {
        setProfile(data);
        setFormData({
          nombre_completo: data.nombre_completo || "",
          email: data.email || "",
          whatsapp: data.whatsapp || "",
          cedula: data.cedula || "",
          horario_entreno: data.horario_entreno || "",
          role: data.role,
          notas_admin: data.notas_admin || "",
          password: "",
        });
      }
    } catch (err) {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  };

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
            whatsapp: formData.whatsapp,
            cedula: formData.cedula || null,
            horario_entreno: formData.horario_entreno || null,
            role: currentUserRole === "super_admin" ? formData.role : undefined,
            notas_admin: currentUserRole === "super_admin" ? formData.notas_admin || null : undefined,
          },
          password: formData.password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      setProfile(data.profile);
      setFormData((prev) => ({ ...prev, password: "" }));
      showToast(messages.toast.perfilGuardado, "success");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const msg = raw.includes("contraseña") ? "Error al cambiar contraseña: " + raw.split(": ").pop() : messages.toast.perfilError;
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

  const isAdmin = profile.role === "super_admin" || profile.role === "admin";

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn relative">
      <LoadingOverlay show={saving} message={messages.common.guardando} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <Link href={targetUserId ? "/dashboard/miembros" : "/dashboard/mis-pagos"} className="p-2 hover:bg-gym-bg/50 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-gym-muted" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Mi Perfil</h1>
            <p className="text-gym-muted text-sm">Edita tu información personal</p>
          </div>
        </div>
        <Button onClick={handleSave} loading={saving} className="hidden sm:flex">
          <Save className="w-4 h-4 mr-2" /> Guardar
        </Button>
      </div>

      {/* Avatar + role */}
      <Card className="neon-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Avatar src={profile.avatar_url} alt={profile.nombre_completo} size="lg" />
            <div>
              <h3 className="text-lg font-semibold text-gym-text">{profile.nombre_completo || "Sin nombre"}</h3>
              <p className="text-sm text-gym-muted">{profile.email}</p>
              <Badge variant={isAdmin ? "primary" : "secondary"}>
                {profile.role === "super_admin" ? "Super Admin" : profile.role === "admin" ? "Admin" : "Miembro"}
              </Badge>
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
          {targetUserId && (
            <PasswordInput
              label="Contraseña (opcional)"
              placeholder="Dejar vacío para no cambiar"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          )}
          <div>
            <label className="text-xs text-gym-muted mb-1 block">WhatsApp</label>
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
          <div>
            <label className="text-xs text-gym-muted mb-1 block">Horario posible a entrenar (opcional)</label>
            <Input
              value={formData.horario_entreno}
              onChange={(e) => setFormData({ ...formData, horario_entreno: e.target.value })}
              placeholder="Lunes a Viernes 6am-8pm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Inscription */}
      <Card className="neon-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gym-primary" />
            Inscripción
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {profile.inscripcion_pagada ? (
              <>
                <CheckCircle className="w-5 h-5 text-gym-success flex-shrink-0" />
                <div>
                  <p className="text-sm text-gym-success font-medium">Pagada</p>
                  <p className="text-xs text-gym-muted">
                    {profile.inscripcion_fecha ? formatDate(profile.inscripcion_fecha) : ""}
                    {profile.monto_inscripcion_pagado > 0 && ` — ${formatCurrency(profile.monto_inscripcion_pagado)}`}
                  </p>
                </div>
              </>
            ) : (
              <>
                <Clock className="w-5 h-5 text-gym-warning flex-shrink-0" />
                <p className="text-sm text-gym-warning font-medium">Pendiente</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

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
