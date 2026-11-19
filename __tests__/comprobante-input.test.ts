import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ComprobanteInput } from "@/components/pagos/comprobante-input";
import { messages } from "@/lib/messages";

function archivo(nombre: string, tipo: string): File {
  return { name: nombre, type: tipo, size: 1024 } as File;
}

function render(file: File | null, extra: Record<string, unknown> = {}) {
  return renderToString(
    createElement(ComprobanteInput, {
      file,
      onSelect: () => undefined,
      label: messages.bolivares.comprobanteLabel,
      textoVacio: messages.bolivares.adjuntarImagenPdf,
      ...extra,
    })
  );
}

describe("ComprobanteInput", () => {
  it("sin archivo muestra la zona de upload con input de imagen o PDF", () => {
    const html = render(null);
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*,.pdf"');
    expect(html).toContain(messages.bolivares.adjuntarImagenPdf);
    expect(html).toContain(messages.bolivares.comprobanteLabel);
  });

  it("con archivo muestra el preview y ya no permite adjuntar otro", () => {
    const html = render(archivo("comprobante.png", "image/png"));
    expect(html).toContain("comprobante.png");
    expect(html).not.toContain('type="file"');
    expect(html).toContain(messages.bolivares.eliminarComprobante);
    expect(html).toContain(messages.bolivares.ampliarComprobante);
  });

  it("los PDF muestran un icono de documento, no una imagen", () => {
    const html = render(archivo("recibo.pdf", "application/pdf"));
    expect(html).toContain("recibo.pdf");
    expect(html).not.toContain("<img");
  });

  it("muestra el estado de procesamiento mientras el OCR trabaja", () => {
    const html = render(archivo("comprobante.png", "image/png"), { procesando: true });
    expect(html).toContain(messages.bolivares.procesandoImagen);
  });

  it("marca obligatorio con asterisco", () => {
    const html = render(null, { obligatorio: true });
    expect(html).toContain("gym-danger");
  });
});
