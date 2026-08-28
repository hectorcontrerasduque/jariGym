"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { miembrosService } from "@/lib/services/miembros/miembros.service";
import { formatDate, formatCurrency, formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Users, Search, Plus, Eye, UserX, UserCheck, Settings, Save, Pencil } from "lucide-react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { Profile, Pago } from "@/lib/types";
import Link from "next/link";

export default function MiembrosPage() {
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ totalMiembros: 0, membresiaLibre: 0, maxMiembros: 50 });

  const [selectedMiembro, setSelectedMiembro] = useState<Profile | null>(null);
  const [modalDetalle, setModalDetalle] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoPassword, setNuevoPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pagoInscripcion, setPagoInscripcion] = useState<Pago | null>(null);
  const [isMembresiaLibre, setIsMembresiaLibre] = useState(false);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [notasAdmin, setNotasAdmin] = useState("");

  useEffect(() => { loadMiembros(); }, []);

  const loadMiembros = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setCurrentUser(profile);
      }

      const [data, statsData, configData] = await Promise.all([
        miembrosService.listarMiembros(),
        miembrosService.stats(),
        supabase.from("gym_config").select("max_miembros").maybeSingle(),
      ]);
      setMiembros(data);
      setStats({ ...statsData, maxMiembros: configData?.data?.max_miembros || 50 });
    } catch (error) {
      showToast(messages.toast.errorCargaDatos, "error");
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleEmailChange = (value: string) => {
    setNuevoEmail(value);
    setPasswordError("");
    if (value && !validateEmail(value)) {
      setEmailError("Formato de correo inválido");
    } else {
      setEmailError("");
    }
  };

  const handlePasswordChange = (value: string) => {
    setNuevoPassword(value);
    if (value) setPasswordError("");
  };

  const isGmail = (email: string) => email.toLowerCase().endsWith("@gmail.com");

  const handleCrearMiembro = async () => {
    if (!nuevoNombre) return;
    if (nuevoEmail && !validateEmail(nuevoEmail)) return;
    if (!nuevoEmail) return;
    if (!isGmail(nuevoEmail) && !nuevoPassword.trim()) {
      setPasswordError(messages.miembros.contrasenaRequeridaNoGmail);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/miembros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: nuevoEmail,
          nombre: nuevoNombre,
          password: nuevoPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error);
        return;
      }
      setModalNuevo(false);
      setNuevoEmail("");
      setNuevoNombre("");
      setNuevoPassword("");
      setEmailError("");
      setPasswordError("");
      await loadMiembros();
    } catch (error) {
      showToast(messages.toast.miembroError, "error");
    } finally {
      setSaving(false);
    }
  };

  const verDetalle = async (miembro: Profile) => {
    setSelectedMiembro(miembro);
    setPagoInscripcion(null);
    setIsMembresiaLibre(false);
    setIsSuperAdmin(miembro.role === "super_admin");
    setNotasAdmin(miembro.notas_admin || "");
    try {
      const supabase = createClient();
      const [pagoIns, libreData] = await Promise.all([
        supabase
          .from("pagos")
          .select("*")
          .eq("usuario_id", miembro.id)
          .ilike("notas", "%Inscripción%")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("membresias")
          .select("id, fecha_fin")
          .eq("usuario_id", miembro.id)
          .is("fecha_fin", null)
          .limit(1)
          .maybeSingle(),
      ]);
      if (pagoIns.data) setPagoInscripcion(pagoIns.data);
      setIsMembresiaLibre(!!libreData.data);
    } catch (error) {
      showToast(messages.toast.errorCargaDatos, "error");
    }
    setModalDetalle(true);
  };

  const handleToggleStatus = async (miembro: Profile, activar: boolean) => {
    const accion = activar ? "activar" : (miembro.activo === false ? "activar" : "desactivar");
    if (!confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} a ${miembro.nombre_completo}?`)) return;
    try {
      await miembrosService.actualizarEstado(miembro.id, activar);
      showToast(activar ? messages.toast.miembroActivado : messages.toast.miembroDesactivado, "success");
      await loadMiembros();
    } catch (error) {
      showToast(messages.toast.miembroEstadoError, "error");
    }
  };

  const handleToggleMembresiaLibre = async (miembro: Profile) => {
    if (!currentUser) return;
    const accion = isMembresiaLibre ? "remover membresía libre de" : "asignar membresía libre a";
    if (!confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} ${miembro.nombre_completo}?`)) return;
    try {
      await miembrosService.toggleMembresiaLibre(miembro.id, currentUser.id, currentUser.nombre_completo);
      setIsMembresiaLibre(!isMembresiaLibre);
      await loadMiembros();
    } catch (error) {
      showToast(messages.toast.membresiaLibreError, "error");
    }
  };

  const handleToggleSuperAdmin = async (miembro: Profile) => {
    const newRole = isSuperAdmin ? "miembro" : "super_admin";
    const accion = isSuperAdmin ? "remover Super Admin de" : "asignar Super Admin a";
    if (!confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} ${miembro.nombre_completo}?`)) return;
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: miembro.id,
          updates: {
            role: newRole,
            notas_admin: newRole === "super_admin" ? notasAdmin || null : null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cambiar rol");
      setIsSuperAdmin(newRole === "super_admin");
      if (newRole === "miembro") setNotasAdmin("");
      showToast(newRole === "super_admin" ? "Ahora es Super Admin" : "Rol cambiado a Miembro", "success");
      await loadMiembros();
    } catch (error) {
      showToast("Error al cambiar rol", "error");
    }
  };

  const handleSaveNotasAdmin = async (miembro: Profile) => {
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: miembro.id,
          updates: {
            notas_admin: notasAdmin || null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar notas");
      showToast("Notas actualizadas", "success");
      await loadMiembros();
    } catch (error) {
      showToast("Error al guardar notas", "error");
    }
  };

  const miembrosFiltrados = miembros.filter((m) =>
    m.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) ||
    (m.email && m.email.toLowerCase().includes(busqueda.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn relative">
      <LoadingOverlay show={saving} message="Creando miembro..." />
      <div className="absolute top-0 right-0 w-72 h-72 bg-gym-secondary/5 rounded-full blur-3xl animate-pulse" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Miembros</h1>
          <p className="text-gym-muted text-sm">Gestiona los miembros de tu gym</p>
        </div>
        <Button onClick={() => setModalNuevo(true)} className="hidden sm:flex">
          <Plus className="w-4 h-4 mr-2" /> Nuevo Miembro
        </Button>
      </div>

      {/* Mobile floating button */}
      <button
        onClick={() => setModalNuevo(true)}
        className="sm:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gym-success/80 text-white shadow-lg shadow-gym-success/20 flex items-center justify-center active:scale-95 transition-all"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 relative z-10">
        <Card className="neon-card">
          <CardContent className="p-3 text-center">
            <Users className="w-5 h-5 text-gym-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-gym-text neon-text">{stats.totalMiembros}/{stats.maxMiembros}</p>
            <p className="text-xs text-gym-muted">Total</p>
          </CardContent>
        </Card>
        <Card className="neon-card">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-gym-secondary neon-text-secondary">{stats.membresiaLibre}</p>
            <p className="text-xs text-gym-muted">Libres</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative z-10">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gym-muted" />
        <input
          type="text"
          placeholder="Buscar por nombre o correo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-gym-surface border border-gym-border rounded-xl text-gym-text placeholder:text-gym-muted focus:outline-none focus:ring-2 focus:ring-gym-primary"
        />
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block neon-card relative z-10">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gym-border text-left text-xs text-gym-muted">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Registro</th>
                  <th className="px-4 py-3">WhatsApp</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gym-border">
                {miembrosFiltrados.map((miembro) => (
                  <tr key={miembro.id} className="hover:bg-gym-bg/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={miembro.avatar_url} alt={miembro.nombre_completo} size="sm" />
                        <div>
                          <p className="font-medium text-gym-text text-sm">{miembro.nombre_completo}</p>
                          <p className="text-xs text-gym-muted">{miembro.email || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={miembro.role === "super_admin" || miembro.role === "admin" ? "primary" : "secondary"}>
                        {miembro.role === "super_admin" || miembro.role === "admin" ? "Sí" : "No"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={miembro.activo !== false ? "success" : "danger"}>
                        {miembro.activo !== false ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gym-muted">{formatDate(miembro.fecha_inscripcion || miembro.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-gym-muted">{miembro.whatsapp || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Link href={`/dashboard/perfil?user_id=${miembro.id}`}>
                          <Button variant="ghost" size="sm" title="Editar">
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => verDetalle(miembro)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {miembro.activo !== false ? (
                          <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(miembro, false)} className="text-gym-danger hover:text-gym-danger" title="Desactivar">
                            <UserX className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(miembro, true)} className="text-gym-success hover:text-gym-success" title="Activar">
                            <UserCheck className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3 relative z-10">
        {miembrosFiltrados.map((miembro) => (
          <Card key={miembro.id} className="neon-card">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar src={miembro.avatar_url} alt={miembro.nombre_completo} size="md" />
                  <div className="min-w-0">
                    <p className="font-medium text-gym-text truncate">{miembro.nombre_completo}</p>
                    <p className="text-xs text-gym-muted">{miembro.email || "Sin email"}</p>
                  </div>
                </div>
                <Badge variant={miembro.activo !== false ? "success" : "danger"}>
                  {miembro.activo !== false ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-gym-muted mb-3">
                <span>{miembro.role === "super_admin" || miembro.role === "admin" ? "Admin" : "Miembro"}</span>
                <span>{formatDate(miembro.fecha_inscripcion || miembro.created_at)}</span>
              </div>
              <div className="flex gap-2">
                <Link href={`/dashboard/perfil?user_id=${miembro.id}`} className="flex-1">
                  <Button variant="ghost" size="sm" className="w-full">
                    <Pencil className="w-4 h-4 mr-1" /> Editar
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => verDetalle(miembro)}>
                  <Eye className="w-4 h-4 mr-1" /> Ver detalle
                </Button>
                {miembro.activo !== false ? (
                  <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(miembro, false)} className="text-gym-danger">
                    <UserX className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(miembro, true)} className="text-gym-success">
                    <UserCheck className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {miembrosFiltrados.length === 0 && (
        <Card className="neon-card relative z-10">
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-gym-muted mx-auto mb-4" />
            <p className="text-gym-muted">{busqueda ? "No se encontraron miembros" : "No hay miembros"}</p>
          </CardContent>
        </Card>
      )}

      {/* Modal Detalle Miembro */}
      <Modal isOpen={modalDetalle} onClose={() => setModalDetalle(false)} title="Detalle del Miembro">
        {selectedMiembro && (
          <div className="space-y-4">
            {currentUser?.role === "super_admin" && (
              <Link
                href={`/dashboard/perfil?user_id=${selectedMiembro.id}`}
                onClick={() => setModalDetalle(false)}
                className="flex items-center gap-2 p-3 bg-gym-primary/10 rounded-xl hover:bg-gym-primary/20 transition-colors text-gym-primary"
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm font-medium">Editar perfil de este miembro</span>
              </Link>
            )}
            <div className="flex items-center gap-4">
              <Avatar src={selectedMiembro.avatar_url} alt={selectedMiembro.nombre_completo} size="lg" />
              <div>
                <h3 className="font-semibold text-gym-text">{selectedMiembro.nombre_completo}</h3>
                <p className="text-sm text-gym-muted">{selectedMiembro.email || "Sin email"}</p>
                <div className="flex gap-2 mt-1">
                  <Badge variant={selectedMiembro.role === "super_admin" ? "primary" : selectedMiembro.role === "admin" ? "primary" : "secondary"}>
                    {selectedMiembro.role === "super_admin" ? "Super Admin" : selectedMiembro.role === "admin" ? "Admin" : "Miembro"}
                  </Badge>
                  <Badge variant={selectedMiembro.activo !== false ? "success" : "danger"}>
                    {selectedMiembro.activo !== false ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gym-muted">Cédula</p>
                <p className="text-gym-text">{selectedMiembro.cedula || "—"}</p>
              </div>
              <div>
                <p className="text-gym-muted">WhatsApp</p>
                <p className="text-gym-text">{selectedMiembro.whatsapp || "—"}</p>
              </div>
              <div>
                <p className="text-gym-muted">Horario</p>
                <p className="text-gym-text">{selectedMiembro.horario_entreno || "—"}</p>
              </div>
              <div>
                <p className="text-gym-muted">Registro</p>
                <p className="text-gym-text">{formatDate(selectedMiembro.fecha_inscripcion || selectedMiembro.created_at)}</p>
              </div>
            </div>

            {/* Inscripción desde pagos */}
            <div className="p-4 bg-gym-bg rounded-xl">
              <p className="text-sm font-medium text-gym-muted mb-2">Inscripción</p>
              {pagoInscripcion ? (
                <div>
                  <div className="flex items-center justify-between">
                    <Badge variant="success">Pagada</Badge>
                    <span className="text-lg font-bold text-gym-text neon-text">{formatCurrency(pagoInscripcion.monto)}</span>
                  </div>
                  <p className="text-xs text-gym-muted mt-1">
                    Pago: {formatDateTime(pagoInscripcion.created_at)}
                  </p>
                  {pagoInscripcion.approved_at && (
                    <p className="text-xs text-gym-success">
                      Confirmado: {formatDateTime(pagoInscripcion.approved_at)}
                    </p>
                  )}
                </div>
              ) : (
                <Badge variant="warning">Pendiente</Badge>
              )}
            </div>

            {/* Membresía libre toggle */}
            <div className="p-4 bg-gym-bg rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gym-muted">Membresía Libre</p>
                  <p className="text-xs text-gym-muted">Sin cargo mensual</p>
                </div>
                <button
                  onClick={() => handleToggleMembresiaLibre(selectedMiembro)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isMembresiaLibre ? "bg-gym-secondary" : "bg-gym-border"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isMembresiaLibre ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {isMembresiaLibre && (
                <p className="text-xs text-gym-secondary mt-2">Este miembro no paga mensualidad</p>
              )}
            </div>

            {/* Super Admin toggle */}
            <div className="p-4 bg-gym-bg rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gym-muted">Super Admin</p>
                  <p className="text-xs text-gym-muted">Acceso total al sistema</p>
                </div>
                <button
                  onClick={() => handleToggleSuperAdmin(selectedMiembro)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isSuperAdmin ? "bg-gym-primary" : "bg-gym-border"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isSuperAdmin ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {isSuperAdmin && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="text-xs text-gym-muted mb-1 block">Nota de admin</label>
                    <textarea
                      value={notasAdmin}
                      onChange={(e) => setNotasAdmin(e.target.value)}
                      placeholder="Notas internas sobre este miembro..."
                      rows={2}
                      className="w-full px-3 py-2 bg-gym-surface border border-gym-border rounded-xl text-sm text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary/50 resize-none"
                    />
                  </div>
                  <Button size="sm" onClick={() => handleSaveNotasAdmin(selectedMiembro)}>
                    Guardar Nota
                  </Button>
                </div>
              )}
            </div>

            {/* Status toggle */}
            <div className="p-4 bg-gym-bg rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gym-muted">Estado</p>
                  <p className="text-xs text-gym-muted">{selectedMiembro.activo !== false ? "Activo" : "Inactivo"}</p>
                </div>
                <div className="flex gap-2">
                  {selectedMiembro.activo !== false ? (
                    <Button variant="danger" size="sm" onClick={() => { handleToggleStatus(selectedMiembro, false); setModalDetalle(false); }}>
                      <UserX className="w-4 h-4 mr-1" /> Desactivar
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => { handleToggleStatus(selectedMiembro, true); setModalDetalle(false); }}>
                      <UserCheck className="w-4 h-4 mr-1" /> Activar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Nuevo Miembro */}
      <Modal isOpen={modalNuevo} onClose={() => { setModalNuevo(false); setNuevoEmail(""); setNuevoNombre(""); setNuevoPassword(""); setEmailError(""); setPasswordError(""); }} title="Nuevo Miembro">
        <div className="space-y-4">
          <p className="text-sm text-gym-muted">Agrega un miembro por su correo. Estará activo para poder presentar pagos.</p>
          <Input
            label="Nombre completo *"
            placeholder="Juan Pérez"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
          />
          <div>
            <Input
              label="Correo * (será el usuario para inicio de sesión)"
              type="email"
              placeholder="correo@gmail.com"
              value={nuevoEmail}
              onChange={(e) => handleEmailChange(e.target.value)}
              required
            />
            {emailError && <p className="text-xs text-gym-danger mt-1">{emailError}</p>}
          </div>
          <PasswordInput
            label={nuevoEmail && !isGmail(nuevoEmail) ? "Contraseña *" : "Contraseña (opcional, se genera si se deja vacía)"}
            placeholder="••••••••"
            value={nuevoPassword}
            onChange={(e) => handlePasswordChange(e.target.value)}
            required={!!nuevoEmail && !isGmail(nuevoEmail)}
          />
          {passwordError && <p className="text-xs text-gym-danger mt-1">{passwordError}</p>}
          <p className="text-xs text-gym-muted">
            El correo será el usuario de inicio de sesión. Si es Gmail, podrá iniciar con Google.
          </p>
          <Button
            className="hidden sm:flex w-full"
            onClick={handleCrearMiembro}
            disabled={!nuevoNombre || !nuevoEmail || (!!nuevoEmail && !isGmail(nuevoEmail) && !nuevoPassword.trim())}
          >
            <Plus className="w-4 h-4 mr-2" /> Agregar Miembro
          </Button>
        </div>
      </Modal>

      {/* Mobile floating save button for Nuevo Miembro modal */}
      {modalNuevo && (
        <button
          onClick={handleCrearMiembro}
          disabled={!nuevoNombre || !nuevoEmail || (!!nuevoEmail && !isGmail(nuevoEmail) && !nuevoPassword.trim())}
          className="sm:hidden fixed bottom-20 right-4 z-[70] w-14 h-14 rounded-full bg-gym-success/80 text-white shadow-lg shadow-gym-success/20 flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all"
        >
          <Save className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
