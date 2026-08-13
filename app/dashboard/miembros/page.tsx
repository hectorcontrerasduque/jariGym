"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { miembrosService } from "@/lib/services/miembros/miembros.service";
import { pagosService } from "@/lib/services/pagos/pagos.service";
import { formatDate, formatCurrency, formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Users, Search, UserCheck, UserX, Pause, Plus, Eye, ShieldAlert, ArrowDownCircle } from "lucide-react";
import type { Profile, Pago } from "@/lib/types";

type FilterStatus = "todos" | "activo" | "suspendido" | "inactivo";

export default function MiembrosPage() {
  const [miembros, setMiembros] = useState<Profile[]>([]);
  const [filtro, setFiltro] = useState<FilterStatus>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalMiembros: 0, activos: 0, suspendidos: 0, inactivos: 0, membresiaLibre: 0 });

  const [selectedMiembro, setSelectedMiembro] = useState<Profile | null>(null);
  const [modalDetalle, setModalDetalle] = useState(false);
  const [modalEstado, setModalEstado] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [notasEstado, setNotasEstado] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [emailError, setEmailError] = useState("");
  const [pagoInscripcion, setPagoInscripcion] = useState<Pago | null>(null);

  useEffect(() => { loadMiembros(); }, []);

  const loadMiembros = async () => {
    try {
      const [data, statsData] = await Promise.all([
        miembrosService.listarMiembros(),
        miembrosService.stats(),
      ]);
      setMiembros(data);
      setStats(statsData);
    } catch (error) {
      console.error("Error:", error);
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
    if (value && !validateEmail(value)) {
      setEmailError("Formato de correo inválido");
    } else {
      setEmailError("");
    }
  };

  const handleCrearMiembro = async () => {
    if (!nuevoEmail || !nuevoNombre || !validateEmail(nuevoEmail)) return;
    try {
      await miembrosService.crearMiembroPorEmail(nuevoEmail, nuevoNombre);
      setModalNuevo(false);
      setNuevoEmail("");
      setNuevoNombre("");
      setEmailError("");
      await loadMiembros();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const verDetalle = async (miembro: Profile) => {
    setSelectedMiembro(miembro);
    setPagoInscripcion(null);
    try {
      const supabase = createClient();
      const { data: pagoIns } = await supabase
        .from("pagos")
        .select("*")
        .eq("usuario_id", miembro.id)
        .ilike("notas", "%Inscripción%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pagoIns) setPagoInscripcion(pagoIns);
    } catch (error) {
      console.error("Error:", error);
    }
    setModalDetalle(true);
  };

  const handleCambiarEstado = async (nuevoEstado: "activo" | "suspendido" | "inactivo") => {
    if (!selectedMiembro) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { data: profileAdmin } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user!.id)
        .single();

      await supabase.from("member_states").insert({
        tenant_id: profileAdmin?.tenant_id,
        usuario_id: selectedMiembro.id,
        estado: nuevoEstado,
        notas: notasEstado || null,
        changed_by: user!.id,
        fecha_evidencia: new Date().toISOString(),
      });

      await miembrosService.actualizarMiembro(selectedMiembro.id, { estado: nuevoEstado });

      setModalEstado(false);
      setNotasEstado("");
      setSelectedMiembro(null);
      await loadMiembros();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const miembrosFiltrados = miembros
    .filter((m) => (filtro === "todos" ? true : m.estado === filtro))
    .filter((m) => m.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) || (m.email && m.email.toLowerCase().includes(busqueda.toLowerCase())));

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "activo": return <Badge variant="success">Activo</Badge>;
      case "suspendido": return <Badge variant="warning">Suspendido</Badge>;
      case "inactivo": return <Badge variant="danger">Inactivo</Badge>;
      default: return <Badge>{estado}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-gym-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn relative">
      <div className="absolute top-0 right-0 w-72 h-72 bg-gym-secondary/5 rounded-full blur-3xl animate-pulse" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
        <div>
          <h1 className="text-2xl font-display font-bold text-gym-text neon-text">Miembros</h1>
          <p className="text-gym-muted text-sm">Gestiona los miembros de tu gym</p>
        </div>
        <Button onClick={() => setModalNuevo(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo Miembro
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 relative z-10">
        <Card className="neon-card hover:border-gym-primary/50 transition-all cursor-pointer" onClick={() => setFiltro("todos")}>
          <CardContent className="p-3 text-center">
            <Users className="w-5 h-5 text-gym-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-gym-text neon-text">{stats.totalMiembros}</p>
            <p className="text-xs text-gym-muted">Total</p>
          </CardContent>
        </Card>
        <Card className="neon-card hover:border-gym-success/50 transition-all cursor-pointer" onClick={() => setFiltro("activo")}>
          <CardContent className="p-3 text-center">
            <UserCheck className="w-5 h-5 text-gym-success mx-auto mb-1" />
            <p className="text-xl font-bold text-gym-success neon-text-success">{stats.activos}</p>
            <p className="text-xs text-gym-muted">Activos</p>
          </CardContent>
        </Card>
        <Card className="neon-card hover:border-gym-warning/50 transition-all cursor-pointer" onClick={() => setFiltro("suspendido")}>
          <CardContent className="p-3 text-center">
            <Pause className="w-5 h-5 text-gym-warning mx-auto mb-1" />
            <p className="text-xl font-bold text-gym-warning neon-text-secondary">{stats.suspendidos}</p>
            <p className="text-xs text-gym-muted">Suspendidos</p>
          </CardContent>
        </Card>
        <Card className="neon-card hover:border-gym-danger/50 transition-all cursor-pointer" onClick={() => setFiltro("inactivo")}>
          <CardContent className="p-3 text-center">
            <UserX className="w-5 h-5 text-gym-danger mx-auto mb-1" />
            <p className="text-xl font-bold text-gym-danger neon-text-danger">{stats.inactivos}</p>
            <p className="text-xs text-gym-muted">Inactivos</p>
          </CardContent>
        </Card>
        <Card className="neon-card hover:border-gym-secondary/50 transition-all">
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
                  <th className="px-4 py-3">Inscrito</th>
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
                      <Badge variant={miembro.inscripcion_pagada ? "success" : "warning"}>
                        {miembro.inscripcion_pagada ? "Sí" : "No"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{getEstadoBadge(miembro.estado)}</td>
                    <td className="px-4 py-3 text-xs text-gym-muted">{formatDate(miembro.fecha_inscripcion || miembro.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-gym-muted">{miembro.whatsapp || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => verDetalle(miembro)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedMiembro(miembro); setModalEstado(true); }}>
                          <ShieldAlert className="w-4 h-4" />
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
                  <Avatar src={miembro.avatar_url} alt={miembro.nombre_completo} size="md" />
                  <div className="min-w-0">
                    <p className="font-medium text-gym-text truncate">{miembro.nombre_completo}</p>
                    <p className="text-xs text-gym-muted">{miembro.email || "Sin email"}</p>
                  </div>
                </div>
                {getEstadoBadge(miembro.estado)}
              </div>
              <div className="flex items-center gap-4 text-xs text-gym-muted mb-3">
                <span>{miembro.inscripcion_pagada ? "✓ Inscrito" : "✗ Sin inscribir"}</span>
                <span>{formatDate(miembro.fecha_inscripcion || miembro.created_at)}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => verDetalle(miembro)}>
                  <Eye className="w-4 h-4 mr-1" /> Ver
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedMiembro(miembro); setModalEstado(true); }}>
                  <ShieldAlert className="w-4 h-4" />
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

      {/* Modal Detalle Miembro */}
      <Modal isOpen={modalDetalle} onClose={() => setModalDetalle(false)} title="Detalle del Miembro">
        {selectedMiembro && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar src={selectedMiembro.avatar_url} alt={selectedMiembro.nombre_completo} size="lg" />
              <div>
                <h3 className="font-semibold text-gym-text">{selectedMiembro.nombre_completo}</h3>
                <p className="text-sm text-gym-muted">{selectedMiembro.email || "Sin email"}</p>
                {getEstadoBadge(selectedMiembro.estado)}
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

            <div className="p-4 bg-gym-bg rounded-xl">
              <p className="text-sm font-medium text-gym-muted mb-2">Membresía</p>
              <Badge variant={selectedMiembro.membresia_libre ? "default" : "success"}>
                {selectedMiembro.membresia_libre ? "Libre" : "Mensualidad"}
              </Badge>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Estado */}
      <Modal isOpen={modalEstado} onClose={() => setModalEstado(false)} title="Cambiar Estado">
        <div className="space-y-4">
          <p className="text-sm text-gym-muted">
            Cambiar estado de <strong>{selectedMiembro?.nombre_completo}</strong>
          </p>
          <textarea
            placeholder="Nota sobre el cambio de estado (opcional)"
            value={notasEstado}
            onChange={(e) => setNotasEstado(e.target.value)}
            className="w-full px-4 py-2.5 bg-gym-bg border border-gym-border rounded-xl text-gym-text placeholder:text-gym-muted focus:outline-none focus:ring-2 focus:ring-gym-primary resize-none h-20"
          />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={selectedMiembro?.estado === "activo"}
              onClick={() => handleCambiarEstado("activo")}
              style={selectedMiembro?.estado === "activo" ? { opacity: 0.4, cursor: "not-allowed" } : { backgroundColor: "#34D399", color: "white" }}
            >
              <UserCheck className="w-4 h-4 mr-2" /> Activo
            </Button>
            <Button
              className="flex-1"
              disabled={selectedMiembro?.estado === "suspendido"}
              onClick={() => handleCambiarEstado("suspendido")}
              style={selectedMiembro?.estado === "suspendido" ? { opacity: 0.4, cursor: "not-allowed" } : { backgroundColor: "#FBBF24", color: "#0B1120" }}
            >
              <Pause className="w-4 h-4 mr-2" /> Suspendido
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={selectedMiembro?.estado === "inactivo"}
              onClick={() => handleCambiarEstado("inactivo")}
              style={selectedMiembro?.estado === "inactivo" ? { opacity: 0.4, cursor: "not-allowed" } : {}}
            >
              <UserX className="w-4 h-4 mr-2" /> Inactivar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Nuevo Miembro */}
      <Modal isOpen={modalNuevo} onClose={() => setModalNuevo(false)} title="Nuevo Miembro">
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
              label="Correo (de preferencia Gmail) *"
              type="email"
              placeholder="correo@gmail.com"
              value={nuevoEmail}
              onChange={(e) => handleEmailChange(e.target.value)}
            />
            {emailError && <p className="text-xs text-gym-danger mt-1">{emailError}</p>}
          </div>
          <Button className="w-full" onClick={handleCrearMiembro} disabled={!nuevoEmail || !nuevoNombre || !validateEmail(nuevoEmail)}>
            <Plus className="w-4 h-4 mr-2" /> Agregar Miembro
          </Button>
        </div>
      </Modal>
    </div>
  );
}
