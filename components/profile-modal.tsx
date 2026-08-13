"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import {
  Mail,
  Phone,
  Calendar,
  CreditCard,
  Clock,
  Hash,
  CheckCircle,
  XCircle,
  Edit2,
  Save,
  X,
  Gift,
} from "lucide-react";
import type { Profile } from "@/lib/types";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  onUpdate?: (updated: Profile) => void;
}

export function ProfileModal({ isOpen, onClose, profile, onUpdate }: ProfileModalProps) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nombre_completo: profile.nombre_completo,
    whatsapp: profile.whatsapp || "",
    cedula: profile.cedula || "",
    horario_entreno: profile.horario_entreno || "",
  });

  const handleSave = async () => {
    setLoading(true);
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
        .eq("id", profile.id)
        .select()
        .single();

      if (error) throw error;
      if (onUpdate) onUpdate(data);
      setEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mi Perfil">
      <div className="space-y-6">
        {/* Avatar and name */}
        <div className="flex items-center gap-4">
          <Avatar src={profile.avatar_url} alt={profile.nombre_completo} size="lg" />
          <div className="flex-1">
            {editing ? (
              <Input
                value={formData.nombre_completo}
                onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
                placeholder="Nombre completo"
              />
            ) : (
              <h3 className="text-lg font-semibold text-gym-text">{profile.nombre_completo}</h3>
            )}
            <p className="text-sm text-gym-muted">{profile.email}</p>
            <Badge variant={profile.role === "super_admin" || profile.role === "admin" ? "primary" : "secondary"}>
              {profile.role === "super_admin" ? "Super Admin" : profile.role === "admin" ? "Admin" : "Miembro"}
            </Badge>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl">
            <Mail className="w-5 h-5 text-gym-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gym-muted">Email</p>
              <p className="text-sm text-gym-text">{profile.email || "No registrado"}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl">
            <Hash className="w-5 h-5 text-gym-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gym-muted">Cédula</p>
              {editing ? (
                <Input
                  value={formData.cedula}
                  onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
                  placeholder="Ej: V-12345678"
                />
              ) : (
                <p className="text-sm text-gym-text">{profile.cedula || "No registrada"}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl">
            <Phone className="w-5 h-5 text-gym-success flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gym-muted">WhatsApp</p>
              {editing ? (
                <Input
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  placeholder="Ej: +58 412 1234567"
                />
              ) : (
                <p className="text-sm text-gym-text">{profile.whatsapp || "No registrado"}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl">
            <Clock className="w-5 h-5 text-gym-secondary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gym-muted">Horario posible a entrenar</p>
              {editing ? (
                <Input
                  value={formData.horario_entreno}
                  onChange={(e) => setFormData({ ...formData, horario_entreno: e.target.value })}
                  placeholder="Ej: Lunes a Viernes 6am-8pm"
                />
              ) : (
                <p className="text-sm text-gym-text">{profile.horario_entreno || "No definido"}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl">
            <Calendar className="w-5 h-5 text-gym-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gym-muted">Fecha de inscripción</p>
              <p className="text-sm text-gym-text">
                {profile.fecha_inscripcion ? formatDate(profile.fecha_inscripcion) : "No registrada"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl">
            <CreditCard className="w-5 h-5 text-gym-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gym-muted">Inscripción</p>
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
          </div>

          <div className="flex items-center gap-3 p-3 bg-gym-bg rounded-xl">
            <Gift className={`w-5 h-5 ${profile.membresia_libre ? "text-gym-secondary" : "text-gym-muted"} flex-shrink-0`} />
            <div className="flex-1">
              <p className="text-xs text-gym-muted">Membresía</p>
              <p className="text-sm text-gym-text">
                {profile.membresia_libre ? "Membresía Libre" : "Mensualidad"}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {editing ? (
            <>
              <Button onClick={handleSave} loading={loading} className="flex-1">
                <Save className="w-4 h-4 mr-2" />
                Guardar
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)} className="flex-1">
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)} variant="secondary" className="w-full">
              <Edit2 className="w-4 h-4 mr-2" />
              Editar Perfil
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
