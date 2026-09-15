"use client";

import { useRef, useState, useCallback } from "react";
import { toPng } from "html-to-image";
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
  const overlayRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);

  const morososOrdenados = [...morosos]
    .sort((a, b) => (b.totalDeuda + b.montoPendiente) - (a.totalDeuda + a.montoPendiente));

  const todosLosMeses = [...new Set(morososOrdenados.flatMap((m) => m.mesesDeuda))].sort((a, b) => a - b);

  const totalDeuda = morososOrdenados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);

  const morososReportados = morososOrdenados.filter((m) => !m.esMigrado);
  const morososNoReportados = morososOrdenados.filter((m) => m.esMigrado);
  const totalDeudaReportados = morososReportados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);
  const totalDeudaNoReportados = morososNoReportados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);

  const handleDescargar = useCallback(async () => {
    if (!reportRef.current || downloadingRef.current) return;
    downloadingRef.current = true;
    if (overlayRef.current) overlayRef.current.style.display = "flex";
    setDownloading(true);
    try {
      const dataUrl = await toPng(reportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0B1120",
      });
      const link = document.createElement("a");
      link.download = `morosos-${gymName.replace(/\s+/g, "-")}-${anio}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      showToast("Error al generar imagen", "error");
    } finally {
      if (overlayRef.current) overlayRef.current.style.display = "none";
      setDownloading(false);
      downloadingRef.current = false;
    }
  }, [gymName, anio]);

  if (morososOrdenados.length === 0) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-gym-surface border border-gym-border rounded-2xl p-6 max-w-md w-full mx-4 text-center">
          <p className="text-gym-muted">No hay morosos.</p>
          <Button onClick={onClose} className="mt-4">Cerrar</Button>
        </div>
      </div>
    );
  }

  const fechaStr = new Date().toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" });

  const inscBadge = (debe: boolean) => (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
      debe ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
    }`}>
      {debe ? messages.reporteMorosos.no : messages.reporteMorosos.si}
    </span>
  );

  const inscBadgeMobile = (debe: boolean) => (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
      debe ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
    }`}>
      Insc: {debe ? messages.reporteMorosos.no : messages.reporteMorosos.si}
    </span>
  );

  const colCount = 4 + todosLosMeses.length;

  const tableHeader = (
    <tr className="border-b border-gym-primary/20">
      <th className="text-left py-2 px-2 text-gray-400 font-medium w-8">#</th>
      <th className="text-left py-2 px-2 text-gray-400 font-medium">Nombre</th>
      <th className="text-center py-2 px-2 text-gray-400 font-medium">{messages.reporteMorosos.reportado}</th>
      <th className="text-center py-2 px-2 text-gray-400 font-medium">Insc.</th>
      {todosLosMeses.map((mes) => (
        <th key={mes} className="text-center py-2 px-2 text-gray-400 font-medium text-xs">
          {getMonthName(mes).slice(0, 3)}
        </th>
      ))}
      <th className="text-right py-2 px-2 text-gray-400 font-medium min-w-[90px] whitespace-nowrap">Deuda</th>
    </tr>
  );

  const tableBody = morososOrdenados.map((m, i) => (
    <tr key={m.id} className="border-b border-gray-800/50">
      <td className="py-2 px-2 text-gray-500">{i + 1}</td>
      <td className="py-2 px-2 text-white font-medium whitespace-nowrap">{m.full_name}</td>
      <td className="text-center py-2 px-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.esMigrado ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
          {m.esMigrado ? messages.reporteMorosos.no : messages.reporteMorosos.si}
        </span>
      </td>
      <td className="text-center py-2 px-2">{inscBadge(m.debeInscripcion)}</td>
      {todosLosMeses.map((mes) => (
        <td key={mes} className="text-center py-2 px-2">
          {m.mesesDeuda.includes(mes) ? (
            <span className="inline-block w-4 h-4 rounded-full bg-gym-danger/80 text-white text-[10px] leading-4">✓</span>
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      ))}
      <td className="py-2 px-2 text-right text-gym-danger font-bold min-w-[90px] whitespace-nowrap">
        {formatCurrency(m.totalDeuda + m.montoPendiente)}
      </td>
    </tr>
  ));

  const tableFooter = (
    <>
      {morososNoReportados.length > 0 && (
        <tr className="border-t border-gym-primary/20">
          <td colSpan={colCount} className="py-2 px-2 text-gray-400 text-sm">
            Reportado (No): {morososNoReportados.length} moroso(s)
          </td>
          <td className="py-2 px-2 text-right text-gym-danger font-bold min-w-[90px] whitespace-nowrap">
            {formatCurrency(totalDeudaNoReportados)}
          </td>
        </tr>
      )}
      {morososReportados.length > 0 && (
        <tr className="border-t border-gray-800/30">
          <td colSpan={colCount} className="py-2 px-2 text-gray-400 text-sm">
            Reportado (Sí): {morososReportados.length} moroso(s)
          </td>
          <td className="py-2 px-2 text-right text-gym-danger font-bold min-w-[90px] whitespace-nowrap">
            {formatCurrency(totalDeudaReportados)}
          </td>
        </tr>
      )}
      <tr className="border-t border-gym-primary/30">
        <td colSpan={colCount} className="py-3 px-2 text-gray-400 font-medium">
          {messages.reporteMorosos.totalMorosos}: {morososOrdenados.length}
        </td>
        <td className="py-3 px-2 text-right text-gym-danger font-bold text-base min-w-[90px] whitespace-nowrap">
          {formatCurrency(totalDeuda)}
        </td>
      </tr>
    </>
  );

  return (
    <>
      {/* Overlay — shown via DOM ref for instant feedback */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[250] items-center justify-center bg-black/60 backdrop-blur-sm"
        style={{ display: "none" }}
      >
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-2 border-gym-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-gym-muted text-sm mt-4">Generando imagen...</p>
        </div>
      </div>

      {/* Hidden container for PNG capture — dark background, landscape table */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none">
        <div ref={reportRef} className="bg-[#0B1120] p-6 rounded-xl w-[960px]">
          <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gym-primary/20">
            {gymLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gymLogo} alt={gymName} className="w-16 h-16 object-contain rounded-xl" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">{gymName}</h1>
              <p className="text-sm text-gray-400">{messages.reporteMorosos.subtitulo} — {anio}</p>
              <p className="text-xs text-gray-500">Fecha: {fechaStr}</p>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>{tableHeader}</thead>
            <tbody>{tableBody}</tbody>
            <tfoot>{tableFooter}</tfoot>
          </table>
        </div>
      </div>

      <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8">
        <div className="bg-gym-surface border border-gym-border rounded-2xl max-w-5xl w-full mx-4 overflow-hidden">
          {/* Toolbar desktop */}
          <div className="hidden sm:flex items-center justify-between p-4 border-b border-gym-border">
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

          {/* Toolbar mobile */}
          <div className="flex sm:hidden flex-col gap-2 p-4 border-b border-gym-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gym-text">{messages.reporteMorosos.titulo}</h2>
              <Button onClick={onClose} variant="ghost" size="sm">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <Button onClick={handleDescargar} disabled={downloading} size="sm" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              {downloading ? "Generando..." : messages.reporteMorosos.descargar}
            </Button>
          </div>

          {/* Report preview — dark mode */}
          <div className="p-4 pl-5 sm:pl-5">
            <div className="bg-[#0B1120] p-4 sm:p-6 rounded-xl w-full sm:w-[960px]">
              <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-gym-primary/20">
                {gymLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={gymLogo} alt={gymName} className="w-10 h-10 sm:w-16 sm:h-16 object-contain rounded-xl" />
                )}
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold text-white">{gymName}</h1>
                  <p className="text-xs sm:text-sm text-gray-400">{messages.reporteMorosos.subtitulo} — {anio}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500">Fecha: {fechaStr}</p>
                </div>
              </div>

              {/* Desktop: Table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead>{tableHeader}</thead>
                  <tbody>{tableBody}</tbody>
                  <tfoot>{tableFooter}</tfoot>
                </table>
              </div>

              {/* Mobile: Cards */}
              <div className="sm:hidden space-y-3">
                {morososOrdenados.map((m, i) => (
                  <div key={m.id} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-gray-500 text-xs">{i + 1}.</span>
                        <span className="text-white font-medium text-sm truncate">{m.full_name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ml-2 ${m.esMigrado ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                        {m.esMigrado ? messages.reporteMorosos.no : messages.reporteMorosos.si}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      {inscBadgeMobile(m.debeInscripcion)}
                    </div>
                    {m.mesesDeuda.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {m.mesesDeuda.map((mes) => (
                          <span key={mes} className="text-[10px] bg-gym-danger/20 text-gym-danger px-1.5 py-0.5 rounded">
                            {getMonthName(mes).slice(0, 3)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">Deuda</span>
                      <span className="text-gym-danger font-bold text-sm">{formatCurrency(m.totalDeuda + m.montoPendiente)}</span>
                    </div>
                  </div>
                ))}
                {/* Mobile subtotals */}
                <div className="space-y-2 pt-2 border-t border-gray-700/50">
                  {morososNoReportados.length > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Reportado (No): {morososNoReportados.length}</span>
                      <span className="text-gym-danger font-bold">{formatCurrency(totalDeudaNoReportados)}</span>
                    </div>
                  )}
                  {morososReportados.length > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Reportado (Sí): {morososReportados.length}</span>
                      <span className="text-gym-danger font-bold">{formatCurrency(totalDeudaReportados)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-gray-400 font-medium border-t border-gym-primary/30 pt-2">
                    <span>Total: {morososOrdenados.length} moroso(s)</span>
                    <span className="text-gym-danger font-bold">{formatCurrency(totalDeuda)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
