/**
 * Compresión de imagen en el cliente antes de subirla (bucket comprobantes).
 *
 * Objetivo: minimizar el tamaño en Vercel/Storage SIN perder legibilidad para
 * el OCR ni para la vista del admin. Reglas:
 * - JPEG con calidad ~0.5 (buen equilibrio tamaño/legibilidad).
 * - Lado mayor máximo 1600px (recibos de pantalla/cámara se leen bien).
 * - Si el archivo ya es pequeño y no excede el límite, se devuelve tal cual.
 *
 * Solo corre en el navegador (usa canvas). Los PDFs se suben sin comprimir.
 */

/** Lado máximo (px) del resultado comprimido. */
const MAX_LADO = 1600;
/** Calidad JPEG de salida (0–1). 0.5 reduce bastante sin romper el OCR. */
const CALIDAD = 0.5;
/** Tamaño (bytes) por debajo del cual no vale la pena recomprimir. */
const UMBRAL_SIN_COMPRIMIR = 400 * 1024; // 400 KB

/** Devuelve true si el archivo es una imagen comprimible (no PDF). */
export function esImagenComprimible(file: File): boolean {
  return (file.type || "").startsWith("image/") && file.type !== "image/gif";
}

/**
 * Comprime una imagen para upload. Devuelve un File listo para subir.
 * - Si no es imagen comprimible o ya es pequeña y cabe en MAX_LADO → el original.
 * - En cualquier fallo de canvas → el original (nunca bloquea el envío).
 */
export async function comprimirImagen(file: File): Promise<File> {
  if (!esImagenComprimible(file)) return file;
  if (file.size <= UMBRAL_SIN_COMPRIMIR) {
    // Aunque sea pequeño, si dimensiones enormes conviene reducir; si falla, original.
    try {
      const dims = await leerDimensiones(file);
      if (dims && dims.ancho <= MAX_LADO && dims.alto <= MAX_LADO) return file;
    } catch {
      return file;
    }
  }

  try {
    const bitmap = await crearImageBitmap(file);
    const { ancho, alto } = escalar(bitmap.width, bitmap.height, MAX_LADO);
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CALIDAD)
    );
    if (!blob || blob.size >= file.size) return file; // si no mejora, original

    const nombre = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

function escalar(w: number, h: number, max: number): { ancho: number; alto: number } {
  if (w <= max && h <= max) return { ancho: w, alto: h };
  const ratio = Math.min(max / w, max / h);
  return { ancho: Math.round(w * ratio), alto: Math.round(h * ratio) };
}

async function crearImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Fallback para navegadores sin createImageBitmap.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      el.src = url;
    });
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function leerDimensiones(file: File): Promise<{ ancho: number; alto: number } | null> {
  try {
    const bitmap = await crearImageBitmap(file);
    const dims = { ancho: bitmap.width, alto: bitmap.height };
    bitmap.close?.();
    return dims;
  } catch {
    return null;
  }
}
