"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  ArrowLeft,
  Save,
  Mail,
  Phone,
  CreditCard,
  Clock,
  CheckCircle,
  Shield,
  FileText,
} from "lucide-react";
import type { Profile } from "@/lib/types";
import Link from "next/link";

export default function PerfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({
    nombre_completo: "",
    email: "",
    whatsapp: "",
    cedula: "",
    horario_entreno: "",
    role: "" as Profile["role"],
    notas_admin: "",
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
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
        });
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!formData.email.trim()) {
      setError("El email es obligatorio");
      return;
    }
    if (!formData.whatsapp.trim()) {
      setError("El WhatsApp es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const isSuperAdmin = profile?.role === "super_admin";
      const updates: Record<string, unknown> = {
        nombre_completo: formData.nombre_completo || profile!.nombre_completo || "Sin nombre",
        email: formData.email,
        whatsapp: formData.whatsapp,
        cedula: formData.cedula || null,
        horario_entreno: formData.horario_entreno || null,
      };
      if (isSuperAdmin) {
        updates.role = formData.role;
        updates.notas_admin = formData.notas_admin || null;
      }
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", profile!.id)
        .select()
        .single();
      if (error) throw error;
      setProfile(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
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
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/mis-pagos" className="p-2 hover:bg-gym-bg/50 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gym-muted" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Mi Perfil</h1>
          <p className="text-gym-muted text-sm">Edita tu información personal</p>
        </div>
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
          <div>
            <label className="text-xs text-gym-muted mb-1 block">WhatsApp <span className="text-gym-danger">*</span></label>
            <Input
              value={formData.whatsapp}
              onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
              placeholder="+58 412 1234567"
              required
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

      {/* Membership */}
      <Card className="neon-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gym-secondary" />
            Membresía
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gym-muted mb-1 block">Rol</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as Profile["role"] })}
                  className="w-full px-3 py-2 bg-gym-surface border border-gym-border rounded-xl text-sm text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary/50"
                >
                  <option value="miembro">Miembro</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gym-muted mb-1 block">Notas admin</label>
                <textarea
                  value={formData.notas_admin}
                  onChange={(e) => setFormData({ ...formData, notas_admin: e.target.value })}
                  placeholder="Notas internas sobre este miembro..."
                  rows={3}
                  className="w-full px-3 py-2 bg-gym-surface border border-gym-border rounded-xl text-sm text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary/50 resize-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-gym-text">Mensualidad</p>
              {profile.notas_admin && (
                <p className="text-xs text-gym-muted flex items-center gap-1 mt-2">
                  <FileText className="w-3 h-3" />
                  {profile.notas_admin}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Messages */}
      {error && (
        <p className="text-sm text-gym-danger text-center bg-gym-danger/10 p-2 rounded-xl">{error}</p>
      )}
      {success && (
        <p className="text-sm text-gym-success text-center bg-gym-success/10 p-2 rounded-xl">
          Perfil actualizado correctamente
        </p>
      )}

      <Button onClick={handleSave} loading={saving} className="w-full">
        <Save className="w-4 h-4 mr-2" />
        Guardar Cambios
      </Button>
    </div>
  );
}
