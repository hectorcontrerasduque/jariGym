import type { BsBankInfo } from "@/lib/types";

export const BS_BANK_INFO_DEFAULT: BsBankInfo = {
  banco: "",
  cedula: "",
  telefono: "",
  tipo_cuenta: "",
  numero_transferencia: "",
  titular: "",
};

export const NUMERO_TRANSFERENCIA_REGEX = /^\d{20}$/;

export interface BsBankInfoValidation {
  ok: boolean;
  faltan: (keyof BsBankInfo)[];
  numeroInvalido: boolean;
}

export function validarBsBankInfo(
  info: Partial<BsBankInfo> | null | undefined
): BsBankInfoValidation {
  const valor = (texto: string | undefined) => String(texto ?? "").trim();

  const banco = valor(info?.banco);
  const cedula = valor(info?.cedula);
  const telefono = valor(info?.telefono);
  const tipoCuenta = valor(info?.tipo_cuenta);
  const numero = valor(info?.numero_transferencia);
  const titular = valor(info?.titular);

  const pagoMovilCompleto = cedula !== "" && telefono !== "";
  const transferenciaPresente = tipoCuenta !== "" || numero !== "" || titular !== "";

  const faltan: (keyof BsBankInfo)[] = [];
  let numeroInvalido = false;

  if (!banco) faltan.push("banco");

  // Pago móvil completo (cédula + teléfono) cubre sus requisitos. Si además se
  // empezó a llenar la transferencia, se exige el set completo para no guardar
  // datos a medias. Sin pago móvil completo, la transferencia es obligatoria.
  const requiereTransferencia = !pagoMovilCompleto || transferenciaPresente;

  if (requiereTransferencia) {
    if (!tipoCuenta) faltan.push("tipo_cuenta");
    if (!numero) faltan.push("numero_transferencia");
    else if (!NUMERO_TRANSFERENCIA_REGEX.test(numero)) numeroInvalido = true;
    if (!titular) faltan.push("titular");
  }

  return {
    ok: faltan.length === 0 && !numeroInvalido,
    faltan,
    numeroInvalido,
  };
}
