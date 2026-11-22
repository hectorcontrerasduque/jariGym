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

/**
 * Lista canónica (nombre comercial a mostrar/guardar).
 * Basada en el listado del BCV (27 instituciones en la cámara de compensación).
 */
export const BANCOS_CANONICOS: string[] = [
  "100% Banco",
  "Banco Activo",
  "Banco Agrícola de Venezuela",
  "Banco Caroní",
  "Banco de la Fuerza Armada Nacional Bolivariana",
  "Banco de Venezuela",
  "Banco del Tesoro",
  "Banco Digital de los Trabajadores",
  "Banco Exterior",
  "Banco Fondo Común",
  "Banco Internacional de Desarrollo",
  "Banco Nacional de Crédito",
  "Banco Plaza",
  "Banco Sofitasa",
  "Bancamiga",
  "Bancaribe",
  "Bancrecer",
  "Banesco",
  "Bangente",
  "Banplus",
  "BBVA Provincial",
  "Delsur",
  "Instituto Municipal de Crédito Popular",
  "Mercantil",
  "N58 Banco Digital",
  "R4",
  "Venezolano de Crédito",
];

/**
 * Alias/variantes → nombre canónico. Solo sirven para encontrar/normalizar;
 * el combobox siempre muestra el nombre comercial.
 */
export const ALIAS_BANCOS: BancoAlias[] = [
  { nombre: "100% Banco", alias: ["100 banco", "cien por ciento banco"] },
  { nombre: "Banco Agrícola de Venezuela", alias: ["banco agricola"] },
  { nombre: "Banco Caroní", alias: ["caroni", "banco caroni"] },
  {
    nombre: "Banco de la Fuerza Armada Nacional Bolivariana",
    alias: ["banfanb", "fuerza armada", "banco de la fuerza armada"],
  },
  { nombre: "Banco de Venezuela", alias: ["bdv", "banco venezuela", "bco venezuela"] },
  { nombre: "Banco del Tesoro", alias: ["bdt"] },
  {
    nombre: "Banco Digital de los Trabajadores",
    alias: ["bicentenario", "banco bicentenario", "digital de los trabajadores"],
  },
  { nombre: "Banco Fondo Común", alias: ["bfc", "fondo comun", "banco fondo comun"] },
  {
    nombre: "Banco Internacional de Desarrollo",
    alias: ["bid", "internacional de desarrollo"],
  },
  { nombre: "Banco Nacional de Crédito", alias: ["bnc", "nacional de credito"] },
  { nombre: "Banco Sofitasa", alias: ["sofitasa"] },
  { nombre: "Bancamiga", alias: ["banco amiga"] },
  { nombre: "Bancaribe", alias: ["banco del caribe"] },
  { nombre: "Bangente", alias: ["banco de la gente emprendedora"] },
  { nombre: "Banplus", alias: ["banco plus"] },
  { nombre: "BBVA Provincial", alias: ["provincial", "banco provincial", "bbva"] },
  { nombre: "Delsur", alias: ["banco del sur", "banco delsur"] },
  {
    nombre: "Instituto Municipal de Crédito Popular",
    alias: ["imcp", "credito popular"],
  },
  { nombre: "Mercantil", alias: ["banco mercantil"] },
  { nombre: "N58 Banco Digital", alias: ["n58"] },
  { nombre: "R4", alias: ["r4", "mi banco", "r4 banco microfinanciero"] },
  {
    nombre: "Venezolano de Crédito",
    alias: ["venezolano de credito", "banco venezolano de credito"],
  },
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
