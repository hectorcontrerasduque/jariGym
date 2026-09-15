"use client";

import { useRef, useState, useCallback } from "react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import { Download, FileDown, X } from "lucide-react";
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

const ROWS_PER_PAGE = 15;
const MAX_PAGES = 4;
const PAGE_WIDTH = 1080;

export function ReporteMorosos({ morosos, gymName, gymLogo, anio, onClose }: ReporteMorososProps) {
  const [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const page3Ref = useRef<HTMLDivElement>(null);
  const page4Ref = useRef<HTMLDivElement>(null);

  const getPageRef = (idx: number) => {
    if (idx === 0) return page1Ref;
    if (idx === 1) return page2Ref;
    if (idx === 2) return page3Ref;
    return page4Ref;
  };

  const morososOrdenados = [...morosos]
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const todosLosMeses = [...new Set(morososOrdenados.flatMap((m) => m.mesesDeuda))].sort((a, b) => a - b);

  const totalDeuda = morososOrdenados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);

  const morososReportados = morososOrdenados.filter((m) => !m.esMigrado);
  const morososNoReportados = morososOrdenados.filter((m) => m.esMigrado);
  const totalDeudaReportados = morososReportados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);
  const totalDeudaNoReportados = morososNoReportados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);

  const totalPages = Math.min(MAX_PAGES, Math.ceil(morososOrdenados.length / ROWS_PER_PAGE));
  const pages: Moroso[][] = [];
  for (let i = 0; i < totalPages; i++) {
    pages.push(morososOrdenados.slice(i * ROWS_PER_PAGE, (i + 1) * ROWS_PER_PAGE));
  }
  const isLastPage = (pageIdx: number) => pageIdx === totalPages - 1;

  const handleDescargar = useCallback(async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    if (overlayRef.current) overlayRef.current.style.display = "flex";
    setDownloading(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      for (let i = 0; i < totalPages; i++) {
        const el = getPageRef(i).current;
        if (!el) continue;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const dataUrl = await toPng(el, {
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
  }, [gymName, anio, totalPages]);

  const handleDescargarPdf = async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    if (overlayRef.current) overlayRef.current.style.display = "flex";
    setDownloading(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 15;
      const fechaStr = new Date().toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" });

      const monthsNames = todosLosMeses.map((m) => getMonthName(m).slice(0, 3));
      const totalPdfPages = Math.ceil(morososOrdenados.length / ROWS_PER_PAGE) || 1;

      // Sort ALL data alphabetically (same as preview)
      const allSorted = [...morososOrdenados].sort((a, b) => a.full_name.localeCompare(b.full_name));

      const tableHeaders = [["#", "Nombre", messages.reporteMorosos.reportado, "Insc.", ...monthsNames, "Deuda"]];

      const drawHeader = (doc: jsPDF, pageNum: number) => {
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageW, 32, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.text(gymName, margin, 14);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(180, 200, 220);
        doc.text(`${messages.reporteMorosos.subtitulo} — ${anio}  |  Fecha: ${fechaStr}`, margin, 21);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(96, 165, 250);
        doc.text(`Página ${pageNum} / ${totalPdfPages}`, pageW - margin, 14, { align: "right" });
      };

      for (let p = 0; p < totalPdfPages; p++) {
        if (p > 0) doc.addPage();

        drawHeader(doc, p + 1);

        const startIdx = p * ROWS_PER_PAGE;
        const pageData = allSorted.slice(startIdx, startIdx + ROWS_PER_PAGE);

        const tableBody = pageData.map((m, i) => [
          String(startIdx + i + 1),
          m.full_name,
          m.esMigrado ? messages.reporteMorosos.no : messages.reporteMorosos.si,
          m.debeInscripcion ? messages.reporteMorosos.no : messages.reporteMorosos.si,
          ...todosLosMeses.map((mes) => (m.mesesDeuda.includes(mes) ? "✓" : "—")),
          formatCurrency(m.totalDeuda + m.montoPendiente),
        ]);

        autoTable(doc, {
          startY: 38,
          head: tableHeaders,
          body: tableBody,
          theme: "grid",
          styles: {
            fontSize: 7.5,
            cellPadding: 2,
            textColor: [30, 30, 30],
            lineColor: [200, 210, 225],
            lineWidth: 0.25,
            fillColor: [255, 255, 255],
            halign: "center",
          },
          headStyles: {
            fillColor: [30, 58, 138],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7.5,
            halign: "center",
            valign: "middle",
          },
          bodyStyles: {
            halign: "center",
            valign: "middle",
          },
          alternateRowStyles: {
            fillColor: [241, 245, 249],
          },
          columnStyles: {
            0: { cellWidth: 10, halign: "center" },
            1: { cellWidth: "auto", halign: "left", fontStyle: "bold" },
            [3 + monthsNames.length]: { halign: "right", fontStyle: "bold", textColor: [220, 38, 38] },
          },
          margin: { left: margin, right: margin, top: 38 },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let y = (doc as any).lastAutoTable.finalY + 5;

        const isLast = p === totalPdfPages - 1;
        const dr = pageData.filter((m) => !m.esMigrado);
        const dnr = pageData.filter((m) => m.esMigrado);
        const td = pageData.reduce((s, m) => s + m.totalDeuda + m.montoPendiente, 0);
        const tdr = dr.reduce((s, m) => s + m.totalDeuda + m.montoPendiente, 0);
        const tdnr = dnr.reduce((s, m) => s + m.totalDeuda + m.montoPendiente, 0);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(80, 80, 80);

        if (dnr.length > 0) {
          doc.text(`Reportado (No): ${dnr.length} moroso(s)`, margin, y);
          doc.text(formatCurrency(tdnr), pageW - margin, y, { align: "right" });
          y += 5;
        }
        if (dr.length > 0) {
          doc.text(`Reportado (Sí): ${dr.length} moroso(s)`, margin, y);
          doc.text(formatCurrency(tdr), pageW - margin, y, { align: "right" });
          y += 5;
        }

        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, pageW - margin, y);
        y += 5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(30, 30, 30);
        if (isLast) {
          doc.text(`${messages.reporteMorosos.totalMorosos}: ${morososOrdenados.length}`, margin, y);
          doc.text(formatCurrency(totalDeuda), pageW - margin, y, { align: "right" });
        } else {
          doc.text(`Subtotal: ${pageData.length} moroso(s)`, margin, y);
          doc.text(formatCurrency(td), pageW - margin, y, { align: "right" });
        }

        // Footer line
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.5);
        doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(140, 140, 140);
        doc.text(`${gymName} — Reporte de Morosos`, margin, pageH - 8);
        doc.text(`${p + 1} / ${totalPdfPages}`, pageW - margin, pageH - 8, { align: "right" });
      }

      doc.save(`morosos-${gymName.replace(/\s+/g, "-")}-${anio}.pdf`);
    } catch {
      showToast("Error al generar PDF", "error");
    } finally {
      if (overlayRef.current) overlayRef.current.style.display = "none";
      setDownloading(false);
      downloadingRef.current = false;
    }
  };

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

  const renderTableHeader = (
    <tr className="border-b-2 border-gym-primary/30">
      <th className="text-left py-3 px-3 text-gray-400 font-medium w-8">#</th>
      <th className="text-left py-3 px-3 text-gray-400 font-semibold">Nombre</th>
      <th className="text-center py-3 px-3 text-gray-400 font-medium">{messages.reporteMorosos.reportado}</th>
      <th className="text-center py-3 px-3 text-gray-400 font-medium">Insc.</th>
      {todosLosMeses.map((mes) => (
        <th key={mes} className="text-center py-3 px-3 text-gray-400 font-medium">
          {getMonthName(mes).slice(0, 3)}
        </th>
      ))}
      <th className="text-right py-3 px-3 text-gray-400 font-semibold whitespace-nowrap">Deuda</th>
    </tr>
  );

  const renderTableBody = (data: Moroso[], startIndex: number) => data.map((m, i) => (
    <tr key={m.id} className="border-b border-gray-800/50">
      <td className="py-3 px-3 text-gray-500">{startIndex + i + 1}</td>
      <td className="py-3 px-3 text-white font-semibold whitespace-nowrap">{m.full_name}</td>
      <td className="text-center py-3 px-3">
        <span className={`inline-block px-3 py-1 rounded-full font-medium ${m.esMigrado ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
          {m.esMigrado ? messages.reporteMorosos.no : messages.reporteMorosos.si}
        </span>
      </td>
      <td className="text-center py-3 px-3">
        <span className={`inline-block px-3 py-1 rounded-full font-medium ${
          m.debeInscripcion ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
        }`}>
          {m.debeInscripcion ? messages.reporteMorosos.no : messages.reporteMorosos.si}
        </span>
      </td>
      {todosLosMeses.map((mes) => (
        <td key={mes} className="text-center py-3 px-3">
          {m.mesesDeuda.includes(mes) ? (
            <span className="inline-block rounded-full bg-gym-danger/80 text-white text-[0.6em] leading-none px-2 py-1">✓</span>
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      ))}
      <td className="py-3 px-3 text-right text-gym-danger font-bold whitespace-nowrap">
        {formatCurrency(m.totalDeuda + m.montoPendiente)}
      </td>
    </tr>
  ));

  const renderTableFooter = (data: Moroso[], grandTotal: boolean) => {
    const dr = data.filter((m) => !m.esMigrado);
    const dnr = data.filter((m) => m.esMigrado);
    const td = data.reduce((s, m) => s + m.totalDeuda + m.montoPendiente, 0);
    const tdr = dr.reduce((s, m) => s + m.totalDeuda + m.montoPendiente, 0);
    const tdnr = dnr.reduce((s, m) => s + m.totalDeuda + m.montoPendiente, 0);

    return (
      <>
        {dnr.length > 0 && (
          <tr className="border-t border-gym-primary/20">
            <td colSpan={colCount} className="py-3 px-3 text-gray-400">
              Reportado (No): {dnr.length} moroso(s)
            </td>
            <td className="py-3 px-3 text-right text-gym-danger font-bold whitespace-nowrap">
              {formatCurrency(tdnr)}
            </td>
          </tr>
        )}
        {dr.length > 0 && (
          <tr className="border-t border-gray-800/30">
            <td colSpan={colCount} className="py-3 px-3 text-gray-400">
              Reportado (Sí): {dr.length} moroso(s)
            </td>
            <td className="py-3 px-3 text-right text-gym-danger font-bold whitespace-nowrap">
              {formatCurrency(tdr)}
            </td>
          </tr>
        )}
        <tr className="border-t-2 border-gym-primary/40">
          <td colSpan={colCount} className="py-4 px-3 text-gray-400 font-medium">
            {grandTotal ? `${messages.reporteMorosos.totalMorosos}: ${morososOrdenados.length}` : `Subtotal: ${data.length} moroso(s)`}
          </td>
          <td className="py-4 px-3 text-right text-gym-danger font-bold whitespace-nowrap">
            {formatCurrency(grandTotal ? totalDeuda : td)}
          </td>
        </tr>
      </>
    );
  };

  const renderPngPage = (pageIdx: number, data: Moroso[], startIndex: number) => (
    <div
      key={pageIdx}
      ref={getPageRef(pageIdx)}
      className="bg-[#0B1120] p-8 rounded-2xl"
      style={{ width: PAGE_WIDTH }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b-2 border-gym-primary/30">
        <div className="flex items-center gap-5">
          {gymLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gymLogo} alt={gymName} className="w-20 h-20 object-contain rounded-xl" />
          )}
          <div>
            <h1 className="text-4xl font-extrabold text-white tracking-tight">{gymName}</h1>
            <p className="text-xl text-gray-400 mt-1">{messages.reporteMorosos.subtitulo} — {anio}</p>
            <p className="text-lg text-gray-500 mt-1">Fecha: {fechaStr}</p>
          </div>
        </div>
        <span className="text-2xl font-bold text-gym-primary whitespace-nowrap">
          {pageIdx + 1}/{totalPages}
        </span>
      </div>

      {/* Table */}
      <table className="w-full text-lg">
        <thead>{renderTableHeader}</thead>
        <tbody>{renderTableBody(data, startIndex)}</tbody>
        <tfoot>{renderTableFooter(data, isLastPage(pageIdx))}</tfoot>
      </table>
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
          <p className="text-gym-muted text-sm mt-4">
            Generando {totalPages > 1 ? `${totalPages} imágenes...` : "imagen..."}
          </p>
        </div>
      </div>

      {/* ===== HIDDEN PNG PAGES — vertical portrait ===== */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none">
        {pages.map((pageData, idx) => renderPngPage(idx, pageData, idx * ROWS_PER_PAGE))}
      </div>

      {/* ===== MODAL PREVIEW ===== */}
      <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8">
        <div className="bg-gym-surface border border-gym-border rounded-2xl max-w-5xl w-full mx-4 overflow-hidden">
          {/* Toolbar desktop */}
          <div className="hidden sm:flex items-center justify-between p-4 border-b border-gym-border">
            <h2 className="text-lg font-bold text-gym-text">{messages.reporteMorosos.titulo}</h2>
            <div className="flex items-center gap-2">
              <Button onClick={handleDescargar} disabled={downloading} size="sm">
                <Download className="w-4 h-4 mr-2" />
                {downloading ? "Generando..." : totalPages > 1 ? `Descargar ${totalPages} imágenes` : messages.reporteMorosos.descargar}
              </Button>
              <Button onClick={handleDescargarPdf} disabled={downloading} size="sm" variant="secondary">
                <FileDown className="w-4 h-4 mr-2" />
                Descargar PDF
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
              {downloading ? "Generando..." : totalPages > 1 ? `Descargar ${totalPages} imágenes` : messages.reporteMorosos.descargar}
            </Button>
            <Button onClick={handleDescargarPdf} disabled={downloading} size="sm" variant="secondary" className="w-full">
              <FileDown className="w-4 h-4 mr-2" />
              Descargar PDF
            </Button>
          </div>

          {/* Report preview — dark mode */}
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
