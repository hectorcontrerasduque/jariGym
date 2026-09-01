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
import { showToast } from "@/components/ui/toast";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { PageLoader } from "@/components/ui/page-loader";
import { messages } from "@/lib/messages";
import {
  Save,
  Mail,
  Clock,
  CheckCircle,
} from "lucide-react";
import type { Profile } from "@/lib/types";

export default function PerfilPage() {
  return (
    <Suspense fallback={<PageLoader />}>
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
    full_name: "",
    email: "",
    phone_number: "",
    document_id: "",
    arrival_time: "--:--",
    departure_time: "--:--",
    role: "" as Profile["role"],
    inscription_admin_note: "",
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
                full_name: targetData.full_name || "",
                email: targetData.email || "",
                phone_number: targetData.phone_number || "",
                document_id: targetData.document_id || "",
                arrival_time: targetData.arrival_time || "--:--",
                departure_time: targetData.departure_time || "--:--",
                role: targetData.role,
                inscription_admin_note: targetData.inscription_admin_note || "",
                password: "",
                currentPassword: "",
              });
            }
          } else {
            setProfile(data);
            setFormData({
              full_name: data.full_name || "",
              email: data.email || "",
              phone_number: data.phone_number || "",
              document_id: data.document_id || "",
              arrival_time: data.arrival_time || "--:--",
              departure_time: data.departure_time || "--:--",
              role: data.role,
              inscription_admin_note: data.inscription_admin_note || "",
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
      showToast(messages.toast.correoFormatoInvalido, "error");
      return;
    }

    let document_idToSend = formData.document_id || null;
    if (document_idToSend && !document_idToSend.startsWith("V-") && !document_idToSend.startsWith("E-")) {
      document_idToSend = `V-${document_idToSend}`;
    }

    let phone_numberToSend = formData.phone_number || "";
    if (phone_numberToSend && !phone_numberToSend.startsWith("+")) {
      phone_numberToSend = `+58${phone_numberToSend}`;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: targetUserId || undefined,
          updates: {
            full_name: (formData.full_name || profile!.full_name || "Sin nombre").trim().toUpperCase(),
            email: formData.email,
            phone_number: phone_numberToSend,
            document_id: document_idToSend,
            arrival_time: formData.arrival_time || null,
            departure_time: formData.departure_time || null,
            role: currentUserRole === "super_admin" ? formData.role : undefined,
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
      const msg = raw.toLowerCase().includes("contraseña") || raw.toLowerCase().includes("correo") || raw.toLowerCase().includes("email")
        ? raw : messages.toast.perfilError;
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!profile) return null;

  const isAdmin = profile.role === "super_admin";

  return (
    <div className="space-y-6 animate-fadeIn relative">
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
            <Avatar src={profile.avatar_url} alt={profile.full_name} size="lg" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gym-text">{profile.full_name || "Sin nombre"}</h3>
              <p className="text-sm text-gym-muted">{profile.email}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant={isAdmin ? "primary" : "secondary"}>
                  {profile.role === "super_admin" ? "Super Admin" : "Miembro"}
                </Badge>
                {profile.inscription_paid ? (
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
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
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
                value={formData.arrival_time === "--:--" ? "" : formData.arrival_time}
                onChange={(e) => setFormData({ ...formData, arrival_time: e.target.value || "--:--" })}
                className="w-full px-3 py-2 rounded-xl border border-gym-border bg-gym-surface text-gym-text text-sm focus:outline-none focus:ring-2 focus:ring-gym-primary/50"
              />
            </div>
            <div>
              <label className="text-xs text-gym-muted mb-1 block">Hora salida (opcional solo referencial, hora militar)</label>
              <input
                type="time"
                value={formData.departure_time === "--:--" ? "" : formData.departure_time}
                onChange={(e) => setFormData({ ...formData, departure_time: e.target.value || "--:--" })}
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
              value={formData.phone_number}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              placeholder="+58 412 1234567"
            />
          </div>
          <div>
            <label className="text-xs text-gym-muted mb-1 block">Cédula (opcional)</label>
            <Input
              value={formData.document_id}
              onChange={(e) => setFormData({ ...formData, document_id: e.target.value })}
              placeholder="V-12345678"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gym-muted mb-1 block">Fecha de inicio</label>
              <Input
                value={profile.start_date ? new Date(profile.start_date).toLocaleDateString("es-ES") : "—"}
                disabled
                className="bg-gym-surface/50"
              />
            </div>
            <div>
              <label className="text-xs text-gym-muted mb-1 block">Estado</label>
              <Input
                value={profile.activo === false ? "Inactivo" : "Activo"}
                disabled
                className="bg-gym-surface/50"
              />
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
