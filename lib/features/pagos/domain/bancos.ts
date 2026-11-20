/**
 * Catálogo canónico de bancos venezolanos.
 *
 * Fuente única para el OCR (`lib/features/pagos/ocr.ts`) y para el combobox del
 * formulario de pago en Bs. Normalizar aquí evita guardar variantes del mismo
 * banco ("bdv", "banco provincial", "BANCO DE VENEZUELA", …).
 */

export interface BancoAlias {
  nombre: string;
  alias: string[];
}

/** Lista canónica (nombre a mostrar/guardar). */
export const BANCOS_CANONICOS: string[] = [
  "Banco Activo",
  "Banco Caroní",
  "Banco de Venezuela",
  "Banco del Tesoro",
  "Banco Nacional de Crédito",
  "Banco Plaza",
  "Bancrecer",
  "Banesco",
  "BBVA Provincial",
  "Bicentenario",
  "100% Banco",
  "Delsur",
  "Mercantil",
  "Venezolano de Crédito",
];

/** Alias/variantes → nombre canónico. */
export const ALIAS_BANCOS: BancoAlias[] = [
  { nombre: "Banco de Venezuela", alias: ["bdv", "banco venezuela", "bco venezuela", "venezuela"] },
  { nombre: "BBVA Provincial", alias: ["provincial", "banco provincial", "bbva"] },
  { nombre: "Banco Nacional de Crédito", alias: ["bnc", "nacional de credito"] },
  { nombre: "Banco del Tesoro", alias: ["bdt"] },
  { nombre: "Banco Caroní", alias: ["caroni", "banco caroni"] },
  { nombre: "Delsur", alias: ["banco del sur", "banco delsur"] },
  { nombre: "Venezolano de Crédito", alias: ["venezolano de credito", "banco venezolano de credito"] },
  { nombre: "100% Banco", alias: ["100 banco", "cien por ciento banco"] },
];

/** Normaliza para comparar: minúsculas, sin acentos, espacios simples. */
export function normalizarBanco(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clavesPorBanco(): Array<{ nombre: string; claves: string[] }> {
  return BANCOS_CANONICOS.map((nombre) => {
    const alias = ALIAS_BANCOS.find((a) => a.nombre === nombre)?.alias ?? [];
    return { nombre, claves: [normalizarBanco(nombre), ...alias.map(normalizarBanco)] };
  });
}

/**
 * Devuelve el nombre canónico si el texto coincide (exacto) con un banco o alias.
 * `null` si no coincide: el formulario debe rechazarlo para no guardar variantes.
 */
export function canonicalizarBanco(texto: string): string | null {
  const consulta = normalizarBanco(texto);
  if (!consulta) return null;
  for (const { nombre, claves } of clavesPorBanco()) {
    if (claves.includes(consulta)) return nombre;
  }
  return null;
}

/** Filtra el catálogo por nombre o alias (para el dropdown del combobox). */
export function buscarBancos(consulta: string): string[] {
  const q = normalizarBanco(consulta);
  const claves = clavesPorBanco();
  if (!q) return claves.map((c) => c.nombre);
  return claves.filter((c) => c.claves.some((clave) => clave.includes(q))).map((c) => c.nombre);
}

export interface CoincidenciaBanco {
  nombre: string;
  indice: number;
}

/**
 * Bancos mencionados en un texto libre (OCR), ordenados por posición.
 * Solo la primera aparición de cada banco.
 */
export function bancosEnTexto(texto: string): CoincidenciaBanco[] {
  const normalizado = normalizarBanco(texto);
  if (!normalizado) return [];
  const encontrados: CoincidenciaBanco[] = [];
  for (const { nombre, claves } of clavesPorBanco()) {
    let indice = Number.POSITIVE_INFINITY;
    for (const clave of claves) {
      const i = normalizado.indexOf(clave);
      if (i !== -1 && i < indice) indice = i;
    }
    if (indice !== Number.POSITIVE_INFINITY) encontrados.push({ nombre, indice });
  }
  return encontrados.sort((a, b) => a.indice - b.indice);
}
