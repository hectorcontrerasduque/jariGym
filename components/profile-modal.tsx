"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Mail,
  Phone,
  Calendar,
  CreditCard,
  Clock,
  Hash,
  CheckCircle,
  XCircle,
  Save,
  X,
  Shield,
  FileText,
} from "lucide-react";
import type { Profile } from "@/lib/types";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  onUpdate?: (updated: Profile) => void;
}

export function ProfileModal({ isOpen, onClose, profile, onUpdate }: ProfileModalProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nombre_completo: profile.nombre_completo || "",
    email: profile.email || "",
    whatsapp: profile.whatsapp || "",
    cedula: profile.cedula || "",
    horario_entreno: profile.horario_entreno || "",
    role: profile.role,
    notas_admin: profile.notas_admin || "",
  });

  const isSuperAdmin = profile.role === "super_admin";
  const isAdmin = profile.role === "super_admin" || profile.role === "admin";

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

    setLoading(true);
    try {
      const supabase = createClient();
      const updates: Record<string, unknown> = {
        nombre_completo: formData.nombre_completo || null,
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
        .eq("id", profile.id)
        .select()
        .single();

      if (error) throw error;
      if (onUpdate) onUpdate(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editar Perfil">
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
        {/* Avatar + role badge */}
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

        {/* Campos personales */}
        <div>
          <h4 className="text-sm font-semibold text-gym-text mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-gym-primary" />
            Información Personal
          </h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gym-muted mb-1 block">
                Nombre completo <span className="text-gym-muted">(opcional)</span>
              </label>
              <Input
                value={formData.nombre_completo}
                onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
                placeholder="Nombre completo"
              />
            </div>
            <div>
              <label className="text-xs text-gym-muted mb-1 block">
                Email <span className="text-gym-danger">*</span>
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@ejemplo.com"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gym-muted mb-1 block">
                WhatsApp <span className="text-gym-danger">*</span>
              </label>
              <Input
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                placeholder="+58 412 1234567"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gym-muted mb-1 block">
                Cédula <span className="text-gym-muted">(opcional)</span>
              </label>
              <Input
                value={formData.cedula}
                onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
                placeholder="V-12345678"
              />
            </div>
            <div>
              <label className="text-xs text-gym-muted mb-1 block">
                Horario posible a entrenar <span className="text-gym-muted">(opcional)</span>
              </label>
              <Input
                value={formData.horario_entreno}
                onChange={(e) => setFormData({ ...formData, horario_entreno: e.target.value })}
                placeholder="Lunes a Viernes 6am-8pm"
              />
            </div>
          </div>
        </div>

        {/* Inscripción */}
        <div className="p-4 bg-gym-bg rounded-xl">
          <h4 className="text-sm font-semibold text-gym-text mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-gym-primary" />
            Inscripción
          </h4>
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
                <XCircle className="w-5 h-5 text-gym-warning flex-shrink-0" />
                <p className="text-sm text-gym-warning font-medium">Pendiente</p>
              </>
            )}
          </div>
        </div>

        {/* Membresía */}
        <div className="p-4 bg-gym-bg rounded-xl">
          <h4 className="text-sm font-semibold text-gym-text mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-gym-secondary" />
            Membresía
          </h4>
          {isSuperAdmin ? (
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
        </div>

        {/* Mensajes */}
        {error && (
          <p className="text-sm text-gym-danger text-center bg-gym-danger/10 p-2 rounded-xl">{error}</p>
        )}
        {success && (
          <p className="text-sm text-gym-success text-center bg-gym-success/10 p-2 rounded-xl">
            Perfil actualizado correctamente
          </p>
        )}

        {/* Botones */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} loading={loading} className="flex-1">
            <Save className="w-4 h-4 mr-2" />
            Guardar
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            <X className="w-4 h-4 mr-2" />
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
