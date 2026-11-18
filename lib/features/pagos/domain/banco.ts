import type { BsBankInfo } from "@/lib/types";
import { NUMERO_TRANSFERENCIA_REGEX } from "@/lib/services/config/bank-info";

export type CampoDatoPago = keyof BsBankInfo;

export interface FilaDatoPago {
  campo: CampoDatoPago;
  valor: string;
}

export interface DatosPagoBs {
  pagoMovil: FilaDatoPago[];
  transferencia: FilaDatoPago[];
}

/**
 * Datos para que el miembro pague en Bs, derivados de `gym_config.bs_bank_info`.
 * Solo devuelve una sección si está completa (misma regla que
 * `validarBsBankInfo`), para no mostrar instrucciones a medias.
 */
export function datosPagoBs(info: Partial<BsBankInfo> | null | undefined): DatosPagoBs {
  const valor = (texto: string | undefined) => String(texto ?? "").trim();

  const banco = valor(info?.banco);
  const cedula = valor(info?.cedula);
  const telefono = valor(info?.telefono);
  const tipoCuenta = valor(info?.tipo_cuenta);
  const numero = valor(info?.numero_transferencia);
  const titular = valor(info?.titular);

  const pagoMovil: FilaDatoPago[] = [];
  if (banco && cedula && telefono) {
    pagoMovil.push(
      { campo: "banco", valor: banco },
      { campo: "cedula", valor: cedula },
      { campo: "telefono", valor: telefono }
    );
  }

  const transferencia: FilaDatoPago[] = [];
  const tipoValido = tipoCuenta === "ahorro" || tipoCuenta === "corriente";
  if (banco && tipoValido && NUMERO_TRANSFERENCIA_REGEX.test(numero) && titular) {
    transferencia.push(
      { campo: "banco", valor: banco },
      { campo: "tipo_cuenta", valor: tipoCuenta },
      { campo: "numero_transferencia", valor: numero },
      { campo: "titular", valor: titular }
    );
  }

  return { pagoMovil, transferencia };
}
