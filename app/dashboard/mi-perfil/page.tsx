"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import {
  User,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  Clock,
  Hash,
  CheckCircle,
  XCircle,
  Save,
  ArrowLeft,
  Gift,
} from "lucide-react";
import type { Profile } from "@/lib/types";

export default function MiPerfilPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    nombre_completo: "",
    whatsapp: "",
    cedula: "",
    horario_entreno: "",
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (data) {
          setProfile(data);
          setFormData({
            nombre_completo: data.nombre_completo || "",
            whatsapp: data.whatsapp || "",
            cedula: data.cedula || "",
            horario_entreno: data.horario_entreno || "",
          });
        }
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .update({
          nombre_completo: formData.nombre_completo,
          whatsapp: formData.whatsapp || null,
          cedula: formData.cedula || null,
          horario_entreno: formData.horario_entreno || null,
        })
        .eq("id", profile!.id)
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
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

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 text-gym-muted hover:text-gym-text transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Mi Perfil</h1>
          <p className="text-gym-muted text-sm">Gestiona tu información personal</p>
        </div>
      </div>

      {/* Avatar and basic info */}
      <Card className="neon-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <Avatar src={profile.avatar_url} alt={profile.nombre_completo} size="lg" />
            <div>
              <h3 className="text-lg font-semibold text-gym-text">{profile.nombre_completo}</h3>
              <p className="text-sm text-gym-muted">{profile.email}</p>
              <Badge variant={profile.role === "super_admin" || profile.role === "admin" ? "primary" : "secondary"}>
                {profile.role === "super_admin" ? "Super Admin" : profile.role === "admin" ? "Admin" : "Miembro"}
              </Badge>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-gym-bg rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4 text-gym-primary" />
                <p className="text-xs text-gym-muted">Email</p>
              </div>
              <p className="text-sm text-gym-text">{profile.email || "No registrado"}</p>
            </div>

            <div className="p-3 bg-gym-bg rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Hash className="w-4 h-4 text-gym-primary" />
                <p className="text-xs text-gym-muted">Cédula</p>
              </div>
              <Input
                value={formData.cedula}
                onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
                placeholder="Ej: V-12345678"
              />
            </div>

            <div className="p-3 bg-gym-bg rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Phone className="w-4 h-4 text-gym-success" />
                <p className="text-xs text-gym-muted">WhatsApp</p>
              </div>
              <Input
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                placeholder="Ej: +58 412 1234567"
              />
            </div>

            <div className="p-3 bg-gym-bg rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-gym-secondary" />
                <p className="text-xs text-gym-muted">Horario posible a entrenar</p>
              </div>
              <Input
                value={formData.horario_entreno}
                onChange={(e) => setFormData({ ...formData, horario_entreno: e.target.value })}
                placeholder="Ej: Lunes a Viernes 6am-8pm"
              />
            </div>

            <div className="p-3 bg-gym-bg rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-gym-primary" />
                <p className="text-xs text-gym-muted">Fecha de inscripción</p>
              </div>
              <p className="text-sm text-gym-text">
                {profile.fecha_inscripcion ? formatDate(profile.fecha_inscripcion) : "No registrada"}
              </p>
            </div>

            <div className="p-3 bg-gym-bg rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-gym-primary" />
                <p className="text-xs text-gym-muted">Inscripción</p>
              </div>
              <div className="flex items-center gap-2">
                {profile.inscripcion_pagada ? (
                  <CheckCircle className="w-4 h-4 text-gym-success" />
                ) : (
                  <XCircle className="w-4 h-4 text-gym-warning" />
                )}
                <p className="text-sm text-gym-text">
                  {profile.inscripcion_pagada ? "Pagada" : "Pendiente"}
                </p>
              </div>
            </div>

            <div className="p-3 bg-gym-bg rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <Gift className={`w-4 h-4 ${profile.membresia_libre ? "text-gym-secondary" : "text-gym-muted"}`} />
                <p className="text-xs text-gym-muted">Membresía</p>
              </div>
              <p className="text-sm text-gym-text">
                {profile.membresia_libre ? "Membresía Libre" : "Mensualidad"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable fields */}
      <Card className="neon-card">
        <CardHeader>
          <CardTitle className="text-lg">Editar Información</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gym-muted mb-2 block">Nombre completo</label>
            <Input
              value={formData.nombre_completo}
              onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
              placeholder="Tu nombre"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gym-muted mb-2 block">Cédula</label>
            <Input
              value={formData.cedula}
              onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
              placeholder="Ej: V-12345678"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gym-muted mb-2 block">WhatsApp</label>
            <Input
              value={formData.whatsapp}
              onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
              placeholder="Ej: +58 412 1234567"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gym-muted mb-2 block">Horario posible a entrenar</label>
            <Input
              value={formData.horario_entreno}
              onChange={(e) => setFormData({ ...formData, horario_entreno: e.target.value })}
              placeholder="Ej: Lunes a Viernes 6am-8pm"
            />
          </div>

          {success && (
            <p className="text-sm text-gym-success text-center bg-gym-success/10 p-2 rounded-xl">
              Perfil actualizado correctamente
            </p>
          )}

          <Button onClick={handleSave} loading={saving} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            Guardar Cambios
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
