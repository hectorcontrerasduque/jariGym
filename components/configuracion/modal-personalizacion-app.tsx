"use client";

import { useEffect, useState } from "react";
import { Palette, RotateCcw, Save, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { showToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { TEMA_DEFAULT, aplicarTema, type TemaConfig } from "@/components/configuracion/app-theme";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  valores: TemaConfig | null;
  onSaved: (parcial: TemaConfig) => void;
}

type Tema = TemaConfig & { id: string; nombre: string };

const TEMAS: Tema[] = [
  { id: "cielo", nombre: "Cielo", ...TEMA_DEFAULT },
  {
    id: "dark",
    nombre: "Dark",
    color_primario: "#E2E8F0",
    color_secundario: "#94A3B8",
    color_fondo: "#020617",
    color_fuente: "#F1F5F9",
    color_superficie: "#030B17",
    color_borde: "#334155",
    font_family: "",
  },
  {
    id: "neon",
    nombre: "Neon",
    color_primario: "#00F5FF",
    color_secundario: "#FF2BD6",
    color_fondo: "#000000",
    color_fuente: "#FFFFFF",
    color_superficie: "#050505",
    color_borde: "#00F5FF",
    font_family: "",
  },
  {
    id: "oceano",
    nombre: "Océano",
    color_primario: "#38BDF8",
    color_secundario: "#22D3EE",
    color_fondo: "#082F49",
    color_fuente: "#F0F9FF",
    color_superficie: "#0B1E2E",
    color_borde: "#155E75",
    font_family: "",
  },
  {
    id: "bosque",
    nombre: "Bosque",
    color_primario: "#34D399",
    color_secundario: "#A3E635",
    color_fondo: "#052E16",
    color_fuente: "#F0FDF4",
    color_superficie: "#041E15",
    color_borde: "#14532D",
    font_family: "",
  },
  {
    id: "ocaso",
    nombre: "Ocaso",
    color_primario: "#FB923C",
    color_secundario: "#F472B6",
    color_fondo: "#1C1917",
    color_fuente: "#FAFAF9",
    color_superficie: "#181310",
    color_borde: "#7C2D12",
    font_family: "",
  },
  {
    id: "violeta",
    nombre: "Violeta",
    color_primario: "#A78BFA",
    color_secundario: "#F472B6",
    color_fondo: "#1E1B4B",
    color_fuente: "#F5F3FF",
    color_superficie: "#161226",
    color_borde: "#4338CA",
    font_family: "",
  },
  {
    id: "carmesi",
    nombre: "Carmesí",
    color_primario: "#F87171",
    color_secundario: "#FBBF24",
    color_fondo: "#18181B",
    color_fuente: "#FAFAFA",
    color_superficie: "#150F10",
    color_borde: "#7F1D1D",
    font_family: "",
  },
  {
    id: "esmeralda",
    nombre: "Esmeralda",
    color_primario: "#10B981",
    color_secundario: "#34D399",
    color_fondo: "#01241C",
    color_fuente: "#D1FAE5",
    color_superficie: "#011A13",
    color_borde: "#064E3B",
    font_family: "",
  },
];

const FONT_OPTIONS = [
  { value: "", label: messages.configuracion.fontDefault },
  { value: "system-ui, -apple-system, sans-serif", label: "System UI" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia (serif)" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "'Courier New', Courier, monospace", label: "Courier (monoespaciada)" },
  { value: "ui-monospace, SFMono-Regular, Menlo, monospace", label: "Monoespaciada moderna" },
];

function fromDefaults(): TemaConfig {
  return { ...TEMA_DEFAULT };
}

function fromValores(valores: TemaConfig | null): TemaConfig {
  if (!valores) return fromDefaults();
  return {
    color_primario: valores.color_primario || TEMA_DEFAULT.color_primario,
    color_secundario: valores.color_secundario || TEMA_DEFAULT.color_secundario,
    color_fondo: valores.color_fondo || TEMA_DEFAULT.color_fondo,
    color_fuente: valores.color_fuente || TEMA_DEFAULT.color_fuente,
    color_superficie: valores.color_superficie || TEMA_DEFAULT.color_superficie,
    color_borde: valores.color_borde || TEMA_DEFAULT.color_borde,
    font_family: valores.font_family || "",
  };
}

function CampoColor({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm text-gym-text">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-gym-muted uppercase">{value}</span>
        <input
          id={id}
          name={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg border border-gym-border bg-transparent cursor-pointer p-0.5"
        />
      </div>
    </div>
  );
}

/** Modal de personalización visual de la app (colores + fuente + temas + reset). */
export function ModalPersonalizacionApp({ isOpen, onClose, valores, onSaved }: Props) {
  const [tema, setTema] = useState<TemaConfig>(fromDefaults);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizar al abrir el modal
    if (isOpen) setTema(fromValores(valores));
  }, [isOpen, valores]);

  const set = (campo: keyof TemaConfig, valor: string) =>
    setTema((prev) => ({ ...prev, [campo]: valor }));

  const reset = () => {
    setTema(fromDefaults());
    showToast(messages.configuracion.resetCargado, "info");
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const payload: TemaConfig = {
        color_primario: tema.color_primario,
        color_secundario: tema.color_secundario,
        color_fondo: tema.color_fondo,
        color_fuente: tema.color_fuente,
        color_superficie: tema.color_superficie,
        color_borde: tema.color_borde,
        font_family: tema.font_family || null,
      };
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: payload }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Error guardando");
      }
      aplicarTema(payload);
      window.dispatchEvent(new Event("config:updated"));
      onSaved(payload);
      showToast(messages.configuracion.personalizacionGuardada, "success");
      onClose();
    } catch {
      showToast(messages.configuracion.personalizacionError, "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={messages.configuracion.personalizacionModalTitulo}
      className="max-w-lg"
    >
      <div className="space-y-5">
        {/* Temas sugeridos */}
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-gym-text mb-2">
            <Sparkles className="w-4 h-4 text-gym-warning" />
            {messages.configuracion.temasSugeridos}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {TEMAS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setTema({
                    color_primario: t.color_primario ?? null,
                    color_secundario: t.color_secundario ?? null,
                    color_fondo: t.color_fondo ?? null,
                    color_fuente: t.color_fuente ?? null,
                    color_superficie: t.color_superficie ?? null,
                    color_borde: t.color_borde ?? null,
                    font_family: t.font_family ?? "",
                  })
                }
                className="rounded-xl border p-2 hover:opacity-90 transition-colors text-left"
                style={{
                  backgroundColor: t.color_superficie || TEMA_DEFAULT.color_superficie,
                  borderColor: t.color_borde || TEMA_DEFAULT.color_borde,
                }}
              >
                <div className="flex gap-1 mb-1.5">
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color_primario || undefined }} />
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color_secundario || undefined }} />
                  <span className="w-4 h-4 rounded-full border border-gym-border" style={{ backgroundColor: t.color_fondo || undefined }} />
                  <span className="w-4 h-4 rounded-full border border-gym-border" style={{ backgroundColor: t.color_fuente || undefined }} />
                </div>
                <p className="text-xs text-gym-text">{t.nombre}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Colores */}
        <div className="space-y-3 rounded-xl border border-gym-border bg-gym-bg p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-gym-text">
            <Palette className="w-4 h-4 text-gym-primary" />
            {messages.configuracion.personalizacionTitulo}
          </p>
          <CampoColor
            id="color-primario"
            label={messages.configuracion.colorPrimario}
            value={tema.color_primario || TEMA_DEFAULT.color_primario}
            onChange={(v) => set("color_primario", v)}
          />
          <CampoColor
            id="color-secundario"
            label={messages.configuracion.colorSecundario}
            value={tema.color_secundario || TEMA_DEFAULT.color_secundario}
            onChange={(v) => set("color_secundario", v)}
          />
          <CampoColor
            id="color-fondo"
            label={messages.configuracion.colorFondo}
            value={tema.color_fondo || TEMA_DEFAULT.color_fondo}
            onChange={(v) => set("color_fondo", v)}
          />
          <CampoColor
            id="color-superficie"
            label={messages.configuracion.colorSuperficie}
            value={tema.color_superficie || TEMA_DEFAULT.color_superficie}
            onChange={(v) => set("color_superficie", v)}
          />
          <CampoColor
            id="color-borde"
            label={messages.configuracion.colorBorde}
            value={tema.color_borde || TEMA_DEFAULT.color_borde}
            onChange={(v) => set("color_borde", v)}
          />
          <CampoColor
            id="color-fuente"
            label={messages.configuracion.colorFuente}
            value={tema.color_fuente || TEMA_DEFAULT.color_fuente}
            onChange={(v) => set("color_fuente", v)}
          />
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="font-family" className="text-sm text-gym-text">
              {messages.configuracion.fontFamily}
            </label>
            <select
              id="font-family"
              name="font_family"
              value={tema.font_family || ""}
              onChange={(e) => set("font_family", e.target.value)}
              className="w-48 rounded-lg border border-gym-border bg-gym-surface px-2 py-1.5 text-sm text-gym-text"
            >
              {FONT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Vista previa */}
        <div
          className="rounded-xl border p-4"
          style={{
            backgroundColor: tema.color_fondo || TEMA_DEFAULT.color_fondo,
            borderColor: tema.color_borde || TEMA_DEFAULT.color_borde,
          }}
        >
          <p className="text-xs mb-2 opacity-70" style={{ color: tema.color_fuente || TEMA_DEFAULT.color_fuente }}>
            {messages.configuracion.vistaPrevia}
          </p>
          <div
            className="flex items-center gap-2 flex-wrap rounded-lg p-2 border"
            style={{
              backgroundColor: tema.color_superficie || TEMA_DEFAULT.color_superficie,
              borderColor: tema.color_borde || TEMA_DEFAULT.color_borde,
            }}
          >
            <span
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{
                backgroundColor: tema.color_primario || TEMA_DEFAULT.color_primario,
                color: tema.color_fondo || TEMA_DEFAULT.color_fondo,
              }}
            >
              Primario
            </span>
            <span
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{
                backgroundColor: tema.color_secundario || TEMA_DEFAULT.color_secundario,
                color: tema.color_fondo || TEMA_DEFAULT.color_fondo,
              }}
            >
              Secundario
            </span>
            <span
              className="text-sm font-medium"
              style={{
                color: tema.color_fuente || TEMA_DEFAULT.color_fuente,
                fontFamily: tema.font_family || undefined,
              }}
            >
              Texto de muestra
            </span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={reset}
            disabled={guardando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gym-border text-gym-muted hover:text-gym-text hover:border-gym-text/40 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            {messages.configuracion.reset}
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gym-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {guardando ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {messages.configuracion.guardar}
          </button>
        </div>
      </div>
    </Modal>
  );
}
