"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { formatCurrency, getMonthName } from "@/lib/utils";
import { messages } from "@/lib/messages";

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

  const morososOrdenados = [...morosos]
    .filter((m) => m.mesesDeuda.length >= 3)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const todosLosMeses = [...new Set(morososOrdenados.flatMap((m) => m.mesesDeuda))].sort((a, b) => a - b);

  const totalDeuda = morososOrdenados.reduce((sum, m) => sum + m.totalDeuda + m.montoPendiente, 0);

  const handleDescargar = () => {
    window.print();
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
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 print:bg-white print:inset-0 print:z-auto">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          [data-report-print], [data-report-print] * { visibility: visible !important; }
          [data-report-print] { position: absolute; left: 0; top: 0; width: 100%; background: white !important; }
          .print-toolbar { display: none !important; }
        }
      `}</style>
      <div className="bg-gym-surface border border-gym-border rounded-2xl max-w-5xl w-full mx-4 overflow-hidden print-toolbar">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-gym-border">
          <h2 className="text-lg font-bold text-gym-text">{messages.reporteMorosos.titulo}</h2>
          <div className="flex items-center gap-2">
            <Button onClick={handleDescargar} size="sm">
              <Printer className="w-4 h-4 mr-2" />
              {messages.reporteMorosos.descargar}
            </Button>
            <Button onClick={onClose} variant="ghost" size="sm">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Report preview */}
        <div className="p-4 overflow-x-auto">
          <div ref={reportRef} data-report-print className="bg-[#0B1120] p-6 rounded-xl w-[800px] print:bg-white print:text-black print:rounded-none print:p-4">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gym-primary/20 print:border-gray-300">
              {gymLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gymLogo} alt={gymName} className="w-16 h-16 object-contain rounded-xl" />
              )}
              <div>
                <h1 className="text-2xl font-bold text-white print:text-black">{gymName}</h1>
                <p className="text-sm text-gray-400 print:text-gray-600">{messages.reporteMorosos.subtitulo} — {anio}</p>
                <p className="text-xs text-gray-500 print:text-gray-500">Fecha: {new Date().toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gym-primary/20 print:border-gray-300">
                  <th className="text-left py-2 px-2 text-gray-400 print:text-gray-600 font-medium w-8">#</th>
                  <th className="text-left py-2 px-2 text-gray-400 print:text-gray-600 font-medium">Nombre</th>
                  <th className="text-center py-2 px-2 text-gray-400 print:text-gray-600 font-medium">{messages.reporteMorosos.reportado}</th>
                  {todosLosMeses.map((mes) => (
                    <th key={mes} className="text-center py-2 px-2 text-gray-400 print:text-gray-600 font-medium text-xs">
                      {getMonthName(mes).slice(0, 3)}
                    </th>
                  ))}
                  <th className="text-right py-2 px-2 text-gray-400 print:text-gray-600 font-medium">Deuda</th>
                </tr>
              </thead>
              <tbody>
                {morososOrdenados.map((m, i) => (
                  <tr key={m.id} className="border-b border-gray-800/50 print:border-gray-200">
                    <td className="py-2 px-2 text-gray-500 print:text-gray-600">{i + 1}</td>
                    <td className="py-2 px-2 text-white print:text-black font-medium truncate max-w-[200px]">{m.full_name}</td>
                    <td className="text-center py-2 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.esMigrado ? "bg-red-100 text-red-700 print:bg-red-100 print:text-red-700" : "bg-green-100 text-green-700 print:bg-green-100 print:text-green-700"}`}>
                        {m.esMigrado ? messages.reporteMorosos.no : messages.reporteMorosos.si}
                      </span>
                    </td>
                    {todosLosMeses.map((mes) => (
                      <td key={mes} className="text-center py-2 px-2">
                        {m.mesesDeuda.includes(mes) ? (
                          <span className="inline-block w-4 h-4 rounded-full bg-gym-danger/80 print:bg-red-500 text-white text-[10px] leading-4">✓</span>
                        ) : (
                          <span className="text-gray-700 print:text-gray-400">—</span>
                        )}
                      </td>
                    ))}
                    <td className="py-2 px-2 text-right text-gym-danger print:text-red-600 font-bold">
                      {formatCurrency(m.totalDeuda + m.montoPendiente)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gym-primary/30 print:border-gray-300">
                  <td colSpan={3 + todosLosMeses.length} className="py-3 px-2 text-gray-400 print:text-gray-600 font-medium">
                    {messages.reporteMorosos.totalMorosos}: {morososOrdenados.length}
                  </td>
                  <td className="py-3 px-2 text-right text-gym-danger print:text-red-600 font-bold text-base">
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
