"use client";

import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { messages } from "@/lib/messages";
import { showToast } from "@/components/ui/toast";

interface Moroso {
  id: string;
  full_name: string;
  mesesDeuda: number[];
  totalDeuda: number;
  debeInscripcion: boolean;
  pagosPendientes: number;
  montoPendiente: number;
  esMigrado: boolean;
}

interface ReporteMorososProps {
  morosos: Moroso[];
  gymName: string;
  gymLogo: string | null;
  anio: number;
  onClose: () => void;
}

export function ReporteMorosos({ morosos, gymName, gymLogo, anio, onClose }: ReporteMorososProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const morososOrdenados = [...morosos]
    .filter((m) => m.mesesDeuda.length >= 3)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const todosLosMeses = [...new Set(morososOrdenados.flatMap((m) => m.mesesDeuda))].sort((a, b) => a - b);

  const totalDeuda = morososOrdenados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);

  const handleDescargar = async () => {
    if (!reportRef.current) return;
    setDownloading(true);
    try {
      const imgs = reportRef.current.querySelectorAll("img");
      imgs.forEach((img) => { (img as HTMLElement).style.display = "none"; });
      const canvas = await html2canvas(reportRef.current, {
        background: "#0B1120",
        scale: 2,
        logging: false,
        backgroundColor: "#0B1120",
      } as Record<string, unknown>);
      imgs.forEach((img) => { (img as HTMLElement).style.display = ""; });
      const dataUrl = canvas.toDataURL("image/png");
      if (!dataUrl || dataUrl === "data:,") {
        showToast("Error al generar imagen", "error");
        return;
      }
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `morosos-${gymName.replace(/\s+/g, "-")}-${anio}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      showToast("Error al generar imagen", "error");
    } finally {
      setDownloading(false);
    }
  };

  if (morososOrdenados.length === 0) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-gym-surface border border-gym-border rounded-2xl p-6 max-w-md w-full mx-4 text-center">
          <p className="text-gym-muted">No hay morosos con más de 3 meses de deuda.</p>
          <Button onClick={onClose} className="mt-4">Cerrar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8">
      <div className="bg-gym-surface border border-gym-border rounded-2xl max-w-5xl w-full mx-4 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-gym-border">
          <h2 className="text-lg font-bold text-gym-text">{messages.reporteMorosos.titulo}</h2>
          <div className="flex items-center gap-2">
            <Button onClick={handleDescargar} disabled={downloading} size="sm">
              <Download className="w-4 h-4 mr-2" />
              {downloading ? "Generando..." : messages.reporteMorosos.descargar}
            </Button>
            <Button onClick={onClose} variant="ghost" size="sm">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Report preview */}
        <div className="p-4 overflow-x-auto">
          <div ref={reportRef} className="bg-[#0B1120] p-6 rounded-xl w-[800px]">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gym-primary/20">
              {gymLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gymLogo} alt={gymName} className="w-16 h-16 object-contain rounded-xl" />
              )}
              <div>
                <h1 className="text-2xl font-bold text-white">{gymName}</h1>
                <p className="text-sm text-gray-400">{messages.reporteMorosos.subtitulo} — {anio}</p>
                <p className="text-xs text-gray-500">Fecha: {new Date().toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gym-primary/20">
                  <th className="text-left py-2 px-2 text-gray-400 font-medium w-8">#</th>
                  <th className="text-left py-2 px-2 text-gray-400 font-medium">Nombre</th>
                  <th className="text-center py-2 px-2 text-gray-400 font-medium">{messages.reporteMorosos.reportado}</th>
                  {todosLosMeses.map((mes) => (
                    <th key={mes} className="text-center py-2 px-2 text-gray-400 font-medium text-xs">
                      {getMonthName(mes).slice(0, 3)}
                    </th>
                  ))}
                  <th className="text-right py-2 px-2 text-gray-400 font-medium">Deuda</th>
                </tr>
              </thead>
              <tbody>
                {morososOrdenados.map((m, i) => (
                  <tr key={m.id} className="border-b border-gray-800/50">
                    <td className="py-2 px-2 text-gray-500">{i + 1}</td>
                    <td className="py-2 px-2 text-white font-medium truncate max-w-[200px]">{m.full_name}</td>
                    <td className="text-center py-2 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.esMigrado ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                        {m.esMigrado ? messages.reporteMorosos.no : messages.reporteMorosos.si}
                      </span>
                    </td>
                    {todosLosMeses.map((mes) => (
                      <td key={mes} className="text-center py-2 px-2">
                        {m.mesesDeuda.includes(mes) ? (
                          <span className="inline-block w-4 h-4 rounded-full bg-gym-danger/80 text-white text-[10px] leading-4">✓</span>
                        ) : (
                          <span className="text-gray-700">—</span>
                        )}
                      </td>
                    ))}
                    <td className="py-2 px-2 text-right text-gym-danger font-bold">
                      {formatCurrency(m.totalDeuda + m.montoPendiente)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gym-primary/30">
                  <td colSpan={3 + todosLosMeses.length} className="py-3 px-2 text-gray-400 font-medium">
                    {messages.reporteMorosos.totalMorosos}: {morososOrdenados.length}
                  </td>
                  <td className="py-3 px-2 text-right text-gym-danger font-bold text-base">
                    {formatCurrency(totalDeuda)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
