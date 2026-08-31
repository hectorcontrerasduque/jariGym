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
import { formatDate, formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Users, Search, Plus, Settings, Save, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import type { Profile, Payment, Membership } from "@/lib/types";
import Link from "next/link";

export default function MiembrosPage() {
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ totalMiembros: 0, membresiaLibre: 0, maxMiembros: 50 });

  const [selectedMiembro, setSelectedMiembro] = useState<Profile | null>(null);
  const [modalGestion, setModalGestion] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoPassword, setNuevoPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pagoInscripcion, setPagoInscripcion] = useState<Payment | null>(null);
  const [isMembresiaLibre, setIsMembresiaLibre] = useState(false);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [historialMembresias, setHistorialMembresias] = useState<Membership[]>([]);
  const [isActivar, setIsActivar] = useState(false);
  const [togglingMembresia, setTogglingMembresia] = useState(false);
  const [togglingSuperAdmin, setTogglingSuperAdmin] = useState(false);
  const [togglingActivar, setTogglingActivar] = useState(false);
  const [savingMembresia, setSavingMembresia] = useState(false);
  const [savingNotaAdmin, setSavingNotaAdmin] = useState(false);
  const [historialExpanded, setHistorialExpanded] = useState(false);

  // Sub-modal: membresía
  const [modalMembresia, setModalMembresia] = useState(false);
  const [notaMembresia, setNotaMembresia] = useState("");
  const [membresiaStartDate, setMembresiaStartDate] = useState("");
  const [membresiaEndDate, setMembresiaEndDate] = useState("");

  // Sub-modal: nota admin
  const [modalNotaAdmin, setModalNotaAdmin] = useState(false);
  const [notaAdminInput, setNotaAdminInput] = useState("");
  const [inscripcionAdminNote, setInscripcionAdminNote] = useState("");

  const fetchMiembrosData = async () => {
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
      supabase.from("gym_config").select("max_members").maybeSingle(),
    ]);
    setMiembros(data);
    setStats({ ...statsData, maxMiembros: configData?.data?.max_members || 50 });
  };

  useEffect(() => {
    let cancelled = false;
    const loadInitial = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();
          if (!cancelled) setCurrentUser(profile);
        }

        const [data, statsData, configData] = await Promise.all([
          miembrosService.listarMiembros(),
          miembrosService.stats(),
          supabase.from("gym_config").select("max_members").maybeSingle(),
        ]);
        if (!cancelled) {
          setMiembros(data);
          setStats({ ...statsData, maxMiembros: configData?.data?.max_members || 50 });
        }
      } catch {
        if (!cancelled) showToast(messages.toast.errorCargaDatos, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadInitial();
    return () => { cancelled = true; };
  }, []);

  const loadMiembros = async () => {
    setLoading(true);
    try {
      await fetchMiembrosData();
    } catch {
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
    } catch {
      showToast(messages.toast.miembroError, "error");
    } finally {
      setSaving(false);
    }
  };

  const loadHistorialMembresias = async (userId: string) => {
    try {
      const historial = await miembrosService.obtenerHistorialMembresias(userId);
      setHistorialMembresias(historial);
    } catch {
      // silent
    }
  };

  const verDetalle = async (miembro: Profile) => {
    setSelectedMiembro(miembro);
    setPagoInscripcion(null);
    setIsMembresiaLibre(false);
    setIsSuperAdmin(miembro.role === "super_admin");
    setIsActivar(miembro.activo !== false);
    setInscripcionAdminNote(miembro.inscription_admin_note || "");
    try {
      const supabase = createClient();

      const { data: inscPago } = await supabase
        .from("payments")
        .select("id")
        .eq("user_id", miembro.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let pagoInsc: Payment | null = null;
      if (inscPago) {
        const { data: detInsc } = await supabase
          .from("payment_detail")
          .select("payment_id")
          .eq("payment_id", inscPago.id)
          .eq("payment_type", "inscripcion")
          .maybeSingle();
        if (detInsc) {
          const { data: pagoFull } = await supabase
            .from("payments")
            .select("*")
            .eq("id", inscPago.id)
            .single();
          pagoInsc = pagoFull;
        }
      }

      const { data: libreData } = await supabase
        .from("memberships")
        .select("id, end_date")
        .eq("user_id", miembro.id)
        .eq("status", "activa")
        .is("end_date", null)
        .limit(1)
        .maybeSingle();

      if (pagoInsc) setPagoInscripcion(pagoInsc);
      setIsMembresiaLibre(!!libreData);

      await loadHistorialMembresias(miembro.id);
    } catch {
      showToast(messages.toast.errorCargaDatos, "error");
    }
    setModalGestion(true);
  };

  const handleToggleMembresia = async (miembro: Profile) => {
    if (!currentUser) return;
    setTogglingMembresia(true);
    try {
      if (isMembresiaLibre) {
        await miembrosService.desactivarMembresia(miembro.id);
        setIsMembresiaLibre(false);
      } else {
        await miembrosService.activarMembresia(miembro.id, currentUser.id);
        setIsMembresiaLibre(true);
      }
      await loadHistorialMembresias(miembro.id);
      // Set form values from latest membership
      const latest = historialMembresias[0];
      if (latest) {
        setMembresiaStartDate(latest.start_date);
        setMembresiaEndDate(latest.end_date || "");
        setNotaMembresia(latest.membership_note || "");
      } else {
        setMembresiaStartDate(new Date().toISOString().split("T")[0]);
        setMembresiaEndDate("");
        setNotaMembresia("");
      }
      setHistorialExpanded(false);
      setModalMembresia(true);
      await loadMiembros();
    } catch {
      showToast(messages.toast.membresiaLibreError, "error");
    } finally {
      setTogglingMembresia(false);
    }
  };

  const handleSaveMembresia = async () => {
    if (!selectedMiembro) return;
    setSavingMembresia(true);
    try {
      const supabase = createClient();
      const { data: latest } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", selectedMiembro.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        const updates: Record<string, unknown> = {
          membership_note: notaMembresia || null,
        };
        if (isMembresiaLibre) {
          updates.start_date = membresiaStartDate || undefined;
          updates.end_date = membresiaEndDate || null;
        }
        await supabase
          .from("memberships")
          .update(updates)
          .eq("id", latest.id);
      }
      setModalMembresia(false);
      await loadHistorialMembresias(selectedMiembro.id);
      showToast(messages.toast.notasGuardadas, "success");
    } catch {
      showToast(messages.toast.notasError, "error");
    } finally {
      setSavingMembresia(false);
    }
  };

  const handleToggleSuperAdmin = async (miembro: Profile) => {
    if (!currentUser) return;
    setTogglingSuperAdmin(true);
    const newRole = isSuperAdmin ? "miembro" : "super_admin";
    const fecha = new Date().toLocaleDateString("es-VE");
    const accion = newRole === "super_admin" ? "Super Admin activado" : "Super Admin desactivado";
    const linea = `* ${fecha} ${currentUser.full_name} - ${accion}`;

    try {
      const currentNote = miembro.inscription_admin_note || "";
      const newNote = currentNote ? `${currentNote}\n${linea}` : linea;

      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: miembro.id,
          updates: {
            role: newRole,
            inscription_admin_note: newNote,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cambiar rol");

      setIsSuperAdmin(newRole === "super_admin");
      setInscripcionAdminNote(newNote);
      setNotaAdminInput("");
      setModalNotaAdmin(true);
      showToast(newRole === "super_admin" ? "Ahora es Super Admin" : "Rol cambiado a Miembro", "success");
      await loadMiembros();
    } catch {
      showToast(messages.toast.errorCambiarRol, "error");
    } finally {
      setTogglingSuperAdmin(false);
    }
  };

  const handleSaveNotaAdmin = async () => {
    if (!selectedMiembro) return;
    setSavingNotaAdmin(true);
    try {
      const nota = notaAdminInput.trim();
      if (!nota) {
        setSavingNotaAdmin(false);
        return;
      }
      const linea = `* ${nota}`;
      const newNote = inscripcionAdminNote ? `${inscripcionAdminNote}\n${linea}` : linea;

      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: selectedMiembro.id,
          updates: { inscription_admin_note: newNote },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar nota");

      setInscripcionAdminNote(newNote);
      setNotaAdminInput("");
      showToast(messages.toast.notasGuardadas, "success");
      await loadMiembros();
    } catch {
      showToast(messages.toast.notasError, "error");
    } finally {
      setSavingNotaAdmin(false);
    }
  };

  const handleToggleActivar = async (miembro: Profile) => {
    const activar = miembro.activo === false;
    setTogglingActivar(true);
    try {
      const res = await fetch("/api/miembros/toggle-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: miembro.id,
          activar,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cambiar estado");
      setIsActivar(activar);
      showToast(activar ? messages.toast.miembroActivado : messages.toast.miembroDesactivado, "success");
      await loadMiembros();
    } catch {
      showToast(messages.toast.miembroEstadoError, "error");
    } finally {
      setTogglingActivar(false);
    }
  };

  const miembrosFiltrados = miembros.filter((m) =>
    m.full_name.toLowerCase().includes(busqueda.toLowerCase()) ||
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
      <LoadingOverlay show={togglingMembresia} message="Actualizando membresía..." />
      <LoadingOverlay show={togglingSuperAdmin} message="Cambiando rol..." />
      <LoadingOverlay show={togglingActivar} message="Actualizando estado..." />
      <LoadingOverlay show={savingMembresia} message="Guardando membresía..." />
      <LoadingOverlay show={savingNotaAdmin} message="Guardando nota..." />
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
                        <Avatar src={miembro.avatar_url} alt={miembro.full_name} size="sm" />
                        <div>
                          <p className="font-medium text-gym-text text-sm">{miembro.full_name}</p>
                          <p className="text-xs text-gym-muted">{miembro.email || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={miembro.role === "super_admin" ? "primary" : "secondary"}>
                        {miembro.role === "super_admin" ? "Sí" : "No"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={miembro.activo !== false ? "success" : "danger"}>
                        {miembro.activo !== false ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gym-muted">{formatDate(miembro.start_date || miembro.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-gym-muted">{miembro.phone_number || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Link href={`/dashboard/perfil?user_id=${miembro.id}`}>
                          <Button variant="ghost" size="sm" title="Editar">
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => verDetalle(miembro)} title="Gestionar">
                          <Settings className="w-4 h-4" />
                        </Button>
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
                  <Avatar src={miembro.avatar_url} alt={miembro.full_name} size="md" />
                  <div className="min-w-0">
                    <p className="font-medium text-gym-text truncate">{miembro.full_name}</p>
                    <p className="text-xs text-gym-muted">{miembro.email || "Sin email"}</p>
                  </div>
                </div>
                <Badge variant={miembro.activo !== false ? "success" : "danger"}>
                  {miembro.activo !== false ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-gym-muted mb-3">
                <span>{miembro.role === "super_admin" ? "Super Admin" : "Miembro"}</span>
                <span>{formatDate(miembro.start_date || miembro.created_at)}</span>
              </div>
              <div className="flex gap-2">
                <Link href={`/dashboard/perfil?user_id=${miembro.id}`} className="flex-1">
                  <Button variant="ghost" size="sm" className="w-full">
                    <Pencil className="w-4 h-4 mr-1" /> Editar
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => verDetalle(miembro)}>
                  <Settings className="w-4 h-4 mr-1" /> Gestionar
                </Button>
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

      {/* Modal Gestión */}
      <Modal isOpen={modalGestion} onClose={() => setModalGestion(false)} title="Gestión">
        {selectedMiembro && (
          <div className="space-y-4">
            {/* Header: Avatar + Badges */}
            <div className="flex items-center gap-4">
              <Avatar src={selectedMiembro.avatar_url} alt={selectedMiembro.full_name} size="lg" />
              <div>
                <h3 className="font-semibold text-gym-text">{selectedMiembro.full_name}</h3>
                <p className="text-sm text-gym-muted">{selectedMiembro.email || "Sin email"}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <Badge variant={selectedMiembro.role === "super_admin" ? "primary" : "secondary"}>
                    {selectedMiembro.role === "super_admin" ? "Super Admin" : "Miembro"}
                  </Badge>
                  <Badge variant={selectedMiembro.activo !== false ? "success" : "danger"}>
                    {selectedMiembro.activo !== false ? "Activo" : "Inactivo"}
                  </Badge>
                  <Badge variant={pagoInscripcion ? "success" : "warning"}>
                    Inscripción: {pagoInscripcion ? "Pagada" : "Pendiente"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gym-muted">Cédula</p>
                <p className="text-gym-text">{selectedMiembro.document_id || "—"}</p>
              </div>
              <div>
                <p className="text-gym-muted">WhatsApp</p>
                <p className="text-gym-text">{selectedMiembro.phone_number || "—"}</p>
              </div>
              <div>
                <p className="text-gym-muted">Registro</p>
                <p className="text-gym-text">{formatDate(selectedMiembro.start_date || selectedMiembro.created_at)}</p>
              </div>
              {pagoInscripcion && (
                <div>
                  <p className="text-gym-muted">Monto Inscripción</p>
                  <p className="text-gym-text font-bold">{formatCurrency(pagoInscripcion.detail?.reduce((s, d) => s + d.payment_amount, 0) || 0)}</p>
                </div>
              )}
            </div>

            {/* Membresía toggle */}
            <div className="p-4 bg-gym-bg rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gym-muted">Membresía</p>
                  <p className="text-xs text-gym-muted">{isMembresiaLibre ? "Activa (sin cargo mensual)" : "Sin membresía activa"}</p>
                </div>
                {togglingMembresia ? (
                  <div className="animate-spin w-6 h-6 border-2 border-gym-secondary border-t-transparent rounded-full" />
                ) : (
                  <button
                    onClick={() => handleToggleMembresia(selectedMiembro)}
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
                )}
              </div>
            </div>

            {/* Super Admin toggle */}
            <div className="p-4 bg-gym-bg rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gym-muted">Super Admin</p>
                  <p className="text-xs text-gym-muted">Acceso total al sistema</p>
                </div>
                {togglingSuperAdmin ? (
                  <div className="animate-spin w-6 h-6 border-2 border-gym-primary border-t-transparent rounded-full" />
                ) : (
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
                )}
              </div>
            </div>

            {/* Activo toggle */}
            <div className="p-4 bg-gym-bg rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gym-muted">Activo</p>
                  <p className="text-xs text-gym-muted">{isActivar ? "Miembro activo en el sistema" : "Miembro inactivo"}</p>
                </div>
                {togglingActivar ? (
                  <div className="animate-spin w-6 h-6 border-2 border-gym-success border-t-transparent rounded-full" />
                ) : (
                  <button
                    onClick={() => handleToggleActivar(selectedMiembro)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isActivar ? "bg-gym-success" : "bg-gym-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isActivar ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Sub-modal: Membresía */}
      <Modal isOpen={modalMembresia} onClose={() => setModalMembresia(false)} title=" ">
        <div className="space-y-4">
          <h2 className="text-lg font-display font-bold text-gym-text neon-text">Membresía</h2>

          {/* Historial colapsable */}
          {historialMembresias.length > 0 && (
            <div className="border border-gym-border rounded-xl overflow-hidden">
              <button
                onClick={() => setHistorialExpanded(!historialExpanded)}
                className="w-full flex items-center justify-between p-3 bg-gym-bg hover:bg-gym-surface transition-colors text-sm text-gym-muted"
              >
                <span>{historialExpanded ? "Click para ver menos" : "Click para ver más"}</span>
                {historialExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {historialExpanded && (
                <div className="max-h-48 overflow-y-auto space-y-2 p-3">
                  {historialMembresias.map((m) => (
                    <div key={m.id} className="p-2 bg-gym-surface rounded-lg text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={m.status === "activa" ? "success" : m.status === "vencida" ? "warning" : "danger"}>
                          {m.status === "activa" ? "Activa" : m.status === "vencida" ? "Vencida" : "Cancelada"}
                        </Badge>
                        <span className="text-gym-muted">
                          {formatDate(m.start_date)} — {m.end_date ? formatDate(m.end_date) : "Actual"}
                        </span>
                      </div>
                      {m.membership_note && (
                        <p className="text-gym-muted mt-1 italic">{m.membership_note}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Formulario del último registro */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gym-muted mb-1 block">Fecha inicio</label>
                {isMembresiaLibre ? (
                  <Input
                    type="date"
                    value={membresiaStartDate}
                    onChange={(e) => setMembresiaStartDate(e.target.value)}
                  />
                ) : (
                  <p className="text-sm text-gym-text bg-gym-surface px-3 py-2 rounded-xl border border-gym-border">
                    {membresiaStartDate ? formatDate(membresiaStartDate) : "—"}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gym-muted mb-1 block">Fecha fin</label>
                {isMembresiaLibre ? (
                  <Input
                    type="date"
                    value={membresiaEndDate}
                    onChange={(e) => setMembresiaEndDate(e.target.value)}
                    placeholder="Perpetua"
                  />
                ) : (
                  <p className="text-sm text-gym-text bg-gym-surface px-3 py-2 rounded-xl border border-gym-border">
                    {membresiaEndDate ? formatDate(membresiaEndDate) : "Perpetua"}
                  </p>
                )}
                {!isMembresiaLibre && (
                  <p className="text-xs text-gym-muted mt-1">Sin fecha = perpetua</p>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-gym-muted mb-1 block">Estado</label>
              <Badge variant={isMembresiaLibre ? "success" : "danger"}>
                {isMembresiaLibre ? "Activa" : "Inactiva"}
              </Badge>
            </div>
            <div>
              <label className="text-xs text-gym-muted mb-1 block">Nota</label>
              <textarea
                value={notaMembresia}
                onChange={(e) => setNotaMembresia(e.target.value)}
                placeholder="Nota sobre esta membresía..."
                rows={3}
                className="w-full px-3 py-2 bg-gym-surface border border-gym-border rounded-xl text-sm text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary/50 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setModalMembresia(false)}>
              Cerrar
            </Button>
            <Button className="flex-1" onClick={handleSaveMembresia} disabled={savingMembresia}>
              {savingMembresia ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Sub-modal: Nota Admin */}
      <Modal isOpen={modalNotaAdmin} onClose={() => { setModalNotaAdmin(false); setNotaAdminInput(""); }} title=" ">
        <div className="space-y-4">
          <h2 className="text-lg font-display font-bold text-gym-text neon-text">Nota de Admin</h2>
          {inscripcionAdminNote && (
            <div className="p-3 bg-gym-surface rounded-xl">
              <label className="text-xs text-gym-muted mb-1 block">Historial</label>
              <p className="text-sm text-gym-text whitespace-pre-wrap">{inscripcionAdminNote}</p>
            </div>
          )}
          <div>
            <label className="text-xs text-gym-muted mb-1 block">Nota</label>
            <textarea
              value={notaAdminInput}
              onChange={(e) => setNotaAdminInput(e.target.value)}
              placeholder="Agregar nota..."
              rows={3}
              className="w-full px-3 py-2 bg-gym-surface border border-gym-border rounded-xl text-sm text-gym-text focus:outline-none focus:ring-2 focus:ring-gym-primary/50 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => { setModalNotaAdmin(false); setNotaAdminInput(""); }}>
              Cerrar
            </Button>
            <Button className="flex-1" onClick={handleSaveNotaAdmin} disabled={savingNotaAdmin}>
              {savingNotaAdmin ? "Guardando..." : "Guardar Nota"}
            </Button>
          </div>
        </div>
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
