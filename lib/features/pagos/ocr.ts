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

/** Siglas → nombre canónico (los recibos suelen mostrar la sigla del banco). */
const ALIAS_BANCOS: { nombre: string; alias: string }[] = [
  { nombre: "Banco de Venezuela", alias: "bdv" },
];

/** Busca un banco conocido (nombre o sigla) en un fragmento de texto. */
function buscarBancoEn(texto: string): string {
  const bajo = texto.toLowerCase();
  for (const { nombre, alias } of ALIAS_BANCOS) {
    if (bajo.includes(alias)) return nombre;
  }
  for (const banco of BANCOS) {
    if (bajo.includes(banco.toLowerCase())) return banco;
  }
  return "";
}

/** Primer banco conocido según su posición en el texto (no en la lista). */
function primerBancoEnTexto(texto: string): string {
  const bajo = texto.toLowerCase();
  let mejor = "";
  let mejorIndice = Number.POSITIVE_INFINITY;
  const candidatos = [
    ...ALIAS_BANCOS.map(({ nombre, alias }) => ({ nombre, clave: alias })),
    ...BANCOS.map((nombre) => ({ nombre, clave: nombre.toLowerCase() })),
  ];
  for (const { nombre, clave } of candidatos) {
    const indice = bajo.indexOf(clave);
    if (indice !== -1 && indice < mejorIndice) {
      mejorIndice = indice;
      mejor = nombre;
    }
  }
  return mejor;
}

/** Líneas con etiquetas que NO contienen un monto (operación, referencia, etc.). */
const LINEA_NO_MONTO =
  /operaci[oó]n|referencia|transacci[oó]n|secuencia|confirmaci[oó]n|control|c[eé]dula|rif|tel[eé]fono|cuenta|tarjeta|fecha|hora/i;

/** Líneas donde suele aparecer el importe principal. */
const LINEA_MONTO = /monto|total|importe|pagad/i;

/** Etiquetas del banco desde el que paga el miembro (el emisor). */
const ETIQUETA_EMISOR = /emisor|origen/i;

/** Etiquetas que preceden a la referencia/operación en recibos. */
const ETIQUETAS_OPERACION =
  /(?:operaci[oó]n|secuencia|confirmaci[oó]n|receipt|operation)[\s:#]*([A-Z0-9][A-Z0-9-]{3,})/i;

const ETIQUETAS_REFERENCIA =
  /(?:referencia|transacci[oó]n)[\s:#]*([A-Z0-9][A-Z0-9-]{3,})/i;


// NOTA: los regex de arriba son lineales (sin anidamiento ni cuantificadores
// ambiguos) — detect-unsafe-regex los acepta.

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
 * Monto en Bs: se prioriza el número marcado como moneda ("1.500.000,00 Bs" /
 * "Bs 1.500.000,00"), luego el de una línea de monto/total, y por último el
 * mayor de las líneas que no son de operación/referencia/datos personales.
 * Así el número de operación (más largo que el monto) nunca gana.
 */
export function extraerMonto(texto: string): number {
  const lineas = texto
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l !== "" && !LINEA_NO_MONTO.test(l));

  const conEtiqueta = lineas.filter((l) => LINEA_MONTO.test(l)).join("\n");
  const preferido = mayorConMoneda(conEtiqueta);
  if (preferido > 0) return preferido;

  const enMoneda = mayorConMoneda(lineas.join("\n"));
  if (enMoneda > 0) return enMoneda;

  // Fallback: mayor número de las líneas permitidas (como antes).
  const candidatos = lineas.join("\n").match(/\d[\d.,]*/g);
  if (!candidatos) return 0;

  let mejor = 0;
  for (const c of candidatos) {
    const valor = parseNumero(c);
    // Umbral: montos en Bs suelen ser grandes; ignoramos códigos pequeños.
    if (valor > mejor && valor >= 100) mejor = valor;
  }
  return mejor;
}

/** Mayor número marcado como moneda (Bs antes o después) en un texto. */
function mayorConMoneda(texto: string): number {
  if (!texto) return 0;
  const patrones = [/(\d[\d.,]*)\s*bs\b/gi, /\bbs\.?\s*(\d[\d.,]*)/gi];
  let mejor = 0;
  for (const patron of patrones) {
    for (const m of texto.matchAll(patron)) {
      const valor = parseNumero(m[1] ?? "");
      if (valor > mejor && valor >= 100) mejor = valor;
    }
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

/**
 * Banco: el recibo de pago móvil muestra banco destino y banco emisor. El
 * miembro paga DESDE su banco (emisor), así que se prioriza el banco emisor
 * (etiqueta "banco emisor/origen"; sigla BDV → Banco de Venezuela). Si no hay
 * etiqueta de emisor, se usa el primer banco conocido del texto.
 */
export function extraerBanco(texto: string): string {
  // Etiqueta de emisor/origen: el banco puede estar en la misma línea o en la
  // siguiente (recibos con etiqueta y valor en líneas separadas).
  let buscarEnSiguiente = false;
  for (const linea of texto.split("\n")) {
    if (buscarEnSiguiente) {
      const enSiguiente = buscarBancoEn(linea);
      if (enSiguiente) return enSiguiente;
      buscarEnSiguiente = false;
    }
    if (!ETIQUETA_EMISOR.test(linea)) continue;
    const enLinea = buscarBancoEn(linea);
    if (enLinea) return enLinea;
    buscarEnSiguiente = true;
  }

  // Fallback: el primer banco que aparece en el recibo (suele ser el emisor).
  return primerBancoEnTexto(texto);
}

/** Referencia: número de operación (o referencia/transacción) del recibo. */
export function extraerReferencia(texto: string): string {
  for (const patron of [ETIQUETAS_OPERACION, ETIQUETAS_REFERENCIA]) {
    const m = texto.match(patron);
    const codigo = (m?.[1] ?? "").trim();
    if (/\d/.test(codigo)) return codigo;
  }
  return "";
}
