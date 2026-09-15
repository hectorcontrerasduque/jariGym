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
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);

  const morososOrdenados = [...morosos]
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const todosLosMeses = [...new Set(morososOrdenados.flatMap((m) => m.mesesDeuda))].sort((a, b) => a - b);

  const totalDeuda = morososOrdenados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);

  const morososReportados = morososOrdenados.filter((m) => !m.esMigrado);
  const morososNoReportados = morososOrdenados.filter((m) => m.esMigrado);
  const totalDeudaReportados = morososReportados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);
  const totalDeudaNoReportados = morososNoReportados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);

  const midIndex = Math.ceil(morososOrdenados.length / 2);
  const page1Data = morososOrdenados.slice(0, midIndex);
  const page2Data = morososOrdenados.slice(midIndex);
  const hasPage2 = page2Data.length > 0;

  const handleDescargar = useCallback(async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    if (overlayRef.current) overlayRef.current.style.display = "flex";
    setDownloading(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const refs = [page1Ref, page2Ref];
      const total = hasPage2 ? 2 : 1;
      for (let i = 0; i < total; i++) {
        const ref = refs[i];
        if (!ref.current) continue;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const dataUrl = await toPng(ref.current, {
          cacheBust: true,
          pixelRatio: 3,
          backgroundColor: "#0B1120",
        });
        const link = document.createElement("a");
        link.download = `morosos-${gymName.replace(/\s+/g, "-")}-${anio}-p${i + 1}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch {
      showToast("Error al generar imagen", "error");
    } finally {
      if (overlayRef.current) overlayRef.current.style.display = "none";
      setDownloading(false);
      downloadingRef.current = false;
    }
  }, [gymName, anio, hasPage2]);

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
  const colCount = 4 + todosLosMeses.length;

  // ===================== SHARED TABLE PARTS (inherit from <table> text-*) =====================

  const renderTableHeader = (
    <tr className="border-b-2 border-gym-primary/30">
      <th className="text-left py-5 px-5 text-gray-400 font-medium w-12">#</th>
      <th className="text-left py-5 px-5 text-gray-400 font-semibold">Nombre</th>
      <th className="text-center py-5 px-5 text-gray-400 font-medium">{messages.reporteMorosos.reportado}</th>
      <th className="text-center py-5 px-5 text-gray-400 font-medium">Insc.</th>
      {todosLosMeses.map((mes) => (
        <th key={mes} className="text-center py-5 px-5 text-gray-400 font-medium">
          {getMonthName(mes).slice(0, 3)}
        </th>
      ))}
      <th className="text-right py-5 px-5 text-gray-400 font-semibold min-w-[120px] whitespace-nowrap">Deuda</th>
    </tr>
  );

  const renderTableBody = (data: Moroso[], startIndex: number) => data.map((m, i) => (
    <tr key={m.id} className="border-b border-gray-800/50">
      <td className="py-5 px-5 text-gray-500">{startIndex + i + 1}</td>
      <td className="py-5 px-5 text-white font-semibold whitespace-nowrap">{m.full_name}</td>
      <td className="text-center py-5 px-5">
        <span className={`inline-block px-4 py-1.5 rounded-full font-medium ${m.esMigrado ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
          {m.esMigrado ? messages.reporteMorosos.no : messages.reporteMorosos.si}
        </span>
      </td>
      <td className="text-center py-5 px-5">
        <span className={`inline-block px-4 py-1.5 rounded-full font-medium ${
          m.debeInscripcion ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
        }`}>
          {m.debeInscripcion ? messages.reporteMorosos.no : messages.reporteMorosos.si}
        </span>
      </td>
      {todosLosMeses.map((mes) => (
        <td key={mes} className="text-center py-5 px-5">
          {m.mesesDeuda.includes(mes) ? (
            <span className="inline-block rounded-full bg-gym-danger/80 text-white text-[0.55em] leading-none px-3 py-1.5">✓</span>
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      ))}
      <td className="py-5 px-5 text-right text-gym-danger font-bold min-w-[120px] whitespace-nowrap">
        {formatCurrency(m.totalDeuda + m.montoPendiente)}
      </td>
    </tr>
  ));

  const renderTableFooter = (data: Moroso[], showGrandTotal: boolean) => {
    const dataReportados = data.filter((m) => !m.esMigrado);
    const dataNoReportados = data.filter((m) => m.esMigrado);
    const totalData = data.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);
    const totalDataReportados = dataReportados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);
    const totalDataNoReportados = dataNoReportados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);

    return (
      <>
        {dataNoReportados.length > 0 && (
          <tr className="border-t border-gym-primary/20">
            <td colSpan={colCount} className="py-4 px-5 text-gray-400">
              Reportado (No): {dataNoReportados.length} moroso(s)
            </td>
            <td className="py-4 px-5 text-right text-gym-danger font-bold min-w-[120px] whitespace-nowrap">
              {formatCurrency(totalDataNoReportados)}
            </td>
          </tr>
        )}
        {dataReportados.length > 0 && (
          <tr className="border-t border-gray-800/30">
            <td colSpan={colCount} className="py-4 px-5 text-gray-400">
              Reportado (Sí): {dataReportados.length} moroso(s)
            </td>
            <td className="py-4 px-5 text-right text-gym-danger font-bold min-w-[120px] whitespace-nowrap">
              {formatCurrency(totalDataReportados)}
            </td>
          </tr>
        )}
        <tr className="border-t-2 border-gym-primary/40">
          <td colSpan={colCount} className="py-5 px-5 text-gray-400 font-medium">
            {showGrandTotal ? `${messages.reporteMorosos.totalMorosos}: ${morososOrdenados.length}` : `Subtotal: ${data.length} moroso(s)`}
          </td>
          <td className="py-5 px-5 text-right text-gym-danger font-bold min-w-[120px] whitespace-nowrap">
            {formatCurrency(showGrandTotal ? totalDeuda : totalData)}
          </td>
        </tr>
      </>
    );
  };

  const renderPngHeader = (pageNum: number, totalPages: number) => (
    <div className="flex items-center justify-between mb-8 pb-6 border-b-2 border-gym-primary/30">
      <div className="flex items-center gap-6">
        {gymLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gymLogo} alt={gymName} className="w-28 h-28 object-contain rounded-2xl" />
        )}
        <div>
          <h1 className="text-5xl font-extrabold text-white tracking-tight">{gymName}</h1>
          <p className="text-2xl text-gray-400 mt-1">{messages.reporteMorosos.subtitulo} — {anio}</p>
          <p className="text-xl text-gray-500 mt-1">Fecha: {fechaStr}</p>
        </div>
      </div>
      <div className="text-right">
        <span className="text-3xl font-bold text-gym-primary">Página {pageNum}/{totalPages}</span>
      </div>
    </div>
  );

  const renderPreviewHeader = () => (
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
  );

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[250] items-center justify-center bg-black/60 backdrop-blur-sm"
        style={{ display: "none" }}
      >
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-2 border-gym-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-gym-muted text-sm mt-4">Generando imagen{hasPage2 ? "es" : ""}...</p>
        </div>
      </div>

      {/* ===== HIDDEN PNG PAGE 1 ===== */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none">
        <div ref={page1Ref} className="bg-[#0B1120] p-14 rounded-2xl w-[2800px]">
          {renderPngHeader(1, hasPage2 ? 2 : 1)}
          <table className="w-full text-[1.75rem]">
            <thead>{renderTableHeader}</thead>
            <tbody>{renderTableBody(page1Data, 0)}</tbody>
            <tfoot>{renderTableFooter(page1Data, !hasPage2)}</tfoot>
          </table>
        </div>
      </div>

      {/* ===== HIDDEN PNG PAGE 2 ===== */}
      {hasPage2 && (
        <div className="fixed -left-[9999px] top-0 pointer-events-none">
          <div ref={page2Ref} className="bg-[#0B1120] p-14 rounded-2xl w-[2800px]">
            {renderPngHeader(2, 2)}
            <table className="w-full text-[1.75rem]">
              <thead>{renderTableHeader}</thead>
              <tbody>{renderTableBody(page2Data, midIndex)}</tbody>
              <tfoot>{renderTableFooter(page2Data, false)}</tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ===== MODAL PREVIEW ===== */}
      <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8">
        <div className="bg-gym-surface border border-gym-border rounded-2xl max-w-5xl w-full mx-4 overflow-hidden">
          {/* Toolbar desktop */}
          <div className="hidden sm:flex items-center justify-between p-4 border-b border-gym-border">
            <h2 className="text-lg font-bold text-gym-text">{messages.reporteMorosos.titulo}</h2>
            <div className="flex items-center gap-2">
              <Button onClick={handleDescargar} disabled={downloading} size="sm">
                <Download className="w-4 h-4 mr-2" />
                {downloading ? "Generando..." : hasPage2 ? "Descargar 2 imágenes" : messages.reporteMorosos.descargar}
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
              {downloading ? "Generando..." : hasPage2 ? "Descargar 2 imágenes" : messages.reporteMorosos.descargar}
            </Button>
          </div>

          {/* Report preview — dark mode, text-sm inherits to all cells */}
          <div className="p-4 pl-5 sm:pl-5">
            <div className="bg-[#0B1120] p-4 sm:p-6 rounded-xl w-full sm:w-[960px]">
              {renderPreviewHeader()}

              {/* Desktop: Table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead>{renderTableHeader}</thead>
                  <tbody>{renderTableBody(morososOrdenados, 0)}</tbody>
                  <tfoot>{renderTableFooter(morososOrdenados, true)}</tfoot>
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        m.debeInscripcion ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                      }`}>
                        Insc: {m.debeInscripcion ? messages.reporteMorosos.no : messages.reporteMorosos.si}
                      </span>
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
