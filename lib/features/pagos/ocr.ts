/**
 * OCR del comprobante de pago en Bs — extrae datos para PRELLENAR el formulario.
 *
 * IMPORTANTE (requisito del módulo): el OCR solo sugiere; el miembro EDITA y
 * confirma antes de enviar. Nunca se guarda lo que salga de aquí sin revisión.
 *
 * tesseract.js se importa de forma LAZY (dynamic import) para no ensuciar el
 * bundle inicial ni el entorno de tests/server.
 *
 * Estrategia de extracción (heurística simple sobre el texto del recibo):
 * - monto en Bs: número grande (> 100) con posible separador de miles / "Bs".
 * - banco: nombre de los bancos venezolanos conocidos (Mercantil, Banesco…).
 * - referencia: número junto a "referencia", "nro. operación", "transacción".
 */

/** Resultado del OCR — campos editables por el usuario antes de enviar. */
export interface DatosComprobante {
  /** Monto en Bs detectado (0 si no se encontró). */
  amount_bs: number;
  /** Banco detectado ("" si no se encontró). */
  bank: string;
  /** Referencia / nro. de operación detectado ("" si no se encontró). */
  reference_number: string;
}

/** Bancos venezolanos reconocibles en los recibos. */
const BANCOS: string[] = [
  "Mercantil",
  "Banesco",
  "Provincial",
  "Banco de Venezuela",
  "Banco Nacional de Crédito",
  "BNC",
  "BBVA Provincial",
  "Banco del Tesoro",
  "Bicentenario",
  "Banco Caroní",
  "100% Banco",
  "Banco Plaza",
  "Bancrecer",
  "Delsur",
  "Banco Activo",
  "Venezolano de Crédito",
];

/** Etiquetas que preceden a la referencia/operación en recibos. */
const ETIQUETAS_REFERENCIA =
  /(?:referencia|nro\.?\s*operaci[oó]n|n[uú]mero\s*de\s*operaci[oó]n|transacci[oó]n|c[oó]digo\s*de\s*operaci[oó]n|receipt|operation)\s*[:#]?\s*([A-Z0-9-]{4,})/i;

// NOTA: el regex de arriba es lineal (sin anidamiento ni cuantificadores ambiguos)
// — detect-unsafe-regex lo acepta. El de montos se construye abajo de forma simple.

/**
 * Ejecuta OCR sobre un archivo de imagen y devuelve los datos detectados.
 * Lanza si tesseract no está disponible o el OCR falla (el caller muestra un
 * mensaje y deja los campos vacíos para edición manual).
 */
export async function leerComprobante(file: File): Promise<DatosComprobante> {
  const texto = await reconocerTexto(file);
  return extraerDatos(texto);
}

/** OCR puro: devuelve el texto completo de la imagen. */
async function reconocerTexto(file: File): Promise<string> {
  // Lazy: tesseract.js pesa; solo se carga cuando el miembro sube una imagen.
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("spa"); // español: recibos en Bs
  try {
    const { data } = await worker.recognize(file);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}

/**
 * Parsea el texto del OCR → datos del comprobante.
 * Exportada para unit-tests sin ejecutar tesseract.
 */
export function extraerDatos(texto: string): DatosComprobante {
  const limpio = texto.replace(/\u00a0/g, " ");
  return {
    amount_bs: extraerMonto(limpio),
    bank: extraerBanco(limpio),
    reference_number: extraerReferencia(limpio),
  };
}

/**
 * Monto en Bs: el número más grande del texto que parezca un importe.
 * Acepta "1.500.000,00", "1,500,000.00", "Bs 1500000".
 */
export function extraerMonto(texto: string): number {
  // Lineal: dígito seguido de dígitos/puntos/comas (sin cuantificadores anidados).
  const candidatos = texto.match(/\d[\d.,]*/g);
  if (!candidatos) return 0;

  let mejor = 0;
  for (const c of candidatos) {
    const valor = parseNumero(c);
    // Umbral: montos en Bs suelen ser grandes; ignoramos códigos pequeños.
    if (valor > mejor && valor >= 100) mejor = valor;
  }
  return mejor;
}

/**
 * Interpreta un número con separadores latinos/anglos:
 * - "1.500.000,00" → 1500000 (punto = miles, coma = decimal)
 * - "1,500,000.00" → 1500000 (coma = miles, punto = decimal)
 * - "1,500,000"    → 1500000 (solo comas en grupos de 3 → miles)
 * - "1500000"      → 1500000
 */
export function parseNumero(texto: string): number {
  const t = texto.trim();
  if (!t) return 0;

  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  let normalizado: string;

  if (coma !== -1 && punto !== -1) {
    // Ambos presentes: el que vaya ÚLTIMO es el decimal.
    if (coma > punto) {
      normalizado = t.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalizado = t.replace(/,/g, "");
    }
  } else if (coma !== -1) {
    // Solo comas: si todas las colas tienen 3 dígitos → separador de miles.
    normalizado = esMiles(t, ",") ? t.replace(/,/g, "") : t.replace(/,/g, ".");
  } else if (punto !== -1) {
    // Solo puntos: colas de 3 → miles; si no, el punto es decimal (Number lo lee).
    normalizado = esMiles(t, ".") ? t.replace(/\./g, "") : t;
  } else {
    normalizado = t;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

/** ¿Todas las colas tras el separador tienen exactamente 3 dígitos? (miles) */
function esMiles(texto: string, sep: string): boolean {
  const partes = texto.split(sep);
  if (partes.length < 2) return false;
  // La última parte NO cuenta como cola de miles si tiene ≠ 3 (p.ej. "25,50").
  return partes.slice(1).every((p) => p.length === 3);
}

/** Banco: busca un nombre conocido en el texto (case-insensitive). */
export function extraerBanco(texto: string): string {
  const bajo = texto.toLowerCase();
  for (const banco of BANCOS) {
    if (bajo.includes(banco.toLowerCase())) return banco;
  }
  return "";
}

/** Referencia: número junto a una etiqueta típica de recibo. */
export function extraerReferencia(texto: string): string {
  const m = texto.match(ETIQUETAS_REFERENCIA);
  if (m?.[1]) return m[1].trim();
  // Sin etiqueta: si hay un código alfanumérico largo suelto, mejor no adivinar.
  return "";
}
