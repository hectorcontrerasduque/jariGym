import { describe, it, expect, beforeEach } from "vitest";
import { createSupabaseFake, type SupabaseFake } from "./helpers/supabase-fake";
import { BolivaresService } from "@/lib/features/pagos/bolivares.service";
import { messages } from "@/lib/messages";

let fake: SupabaseFake;
let service: BolivaresService;

const USER_ID = "miembro-1";
const ADMIN_ID = "admin-1";
const PAGO_ID = "pago-1";

function fakeFile(): File {
  return new File(["fake"], "comprobante.jpg", { type: "image/jpeg" });
}

describe("BolivaresService.crearPago", () => {
  beforeEach(() => {
    fake = createSupabaseFake();
    service = new BolivaresService(fake.client);
    fake.setUser({ id: USER_ID, email: "m@x.com" });
  });

  it("crea payment pendiente + detail + bolivares con snapshot de tasa", async () => {
    // auth.getUser → user; exchange_rates select → tasa;
    // payments insert → pago; payment_detail insert → detalles; storage upload ok;
    // payment_bolivares insert ok.
    fake.on("exchange_rates", "select").reply({ data: { rate_bs: 100 } });
    fake.on("payments", "insert").reply({
      data: { id: PAGO_ID, user_id: USER_ID, status: "pendiente", payment_method: "bs" },
    });
    fake.on("payment_detail", "insert").reply({
      data: [
        { id: "det-1", month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 15 },
        { id: "det-2", month_number: 2, year_number: 2026, payment_type: "mensualidad", payment_amount: 15 },
      ],
    });
    fake.onStorage("comprobantes", "upload").reply({ data: { path: `payments/${PAGO_ID}/comprobante.jpg` } });
    fake.on("payment_bolivares", "insert").reply({ data: null });

    const pago = await service.crearPago({
      user_id: USER_ID,
      detalles: [
        { month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 15 },
        { month_number: 2, year_number: 2026, payment_type: "mensualidad", payment_amount: 15 },
      ],
      amount_bs: 3000, // 3000/100 = 30 USD → 15 + 15
      bank: "Mercantil",
      reference_number: "001",
      comprobante: fakeFile(),
    });

    expect(pago.id).toBe(PAGO_ID);
    expect(pago.status).toBe("pendiente");

    const insertsBol = fake.callsTo("payment_bolivares", "insert");
    expect(insertsBol).toHaveLength(1);
    const payload = insertsBol[0].payload as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(2);
    expect(payload[0].rate_bcv).toBe(100);
    expect(payload[0].amount_usd).toBe(15);
    expect(payload[0].amount_bs).toBe(1500);
    expect(payload[0].reconciled).toBe(false);
    expect(payload[0].image_url).toBe(`payments/${PAGO_ID}/comprobante.jpg`);
    // payment_amount del detail = amount_usd del bolivar (1:1)
    const detInsert = fake.callsTo("payment_detail", "insert")[0].payload as Array<{ payment_amount: number }>;
    expect(detInsert[0].payment_amount).toBe(payload[0].amount_usd);
    expect(detInsert[1].payment_amount).toBe(payload[1].amount_usd);
  });

  it("lanza si no hay tasa BCV vigente", async () => {
    fake.on("exchange_rates", "select").reply({ data: null });
    await expect(
      service.crearPago({
        user_id: USER_ID,
        detalles: [{ month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 }],
        amount_bs: 1000,
      })
    ).rejects.toThrow(messages.bolivares.sinTasa);
  });

  it("lanza si amount_bs no es > 0", async () => {
    await expect(
      service.crearPago({
        user_id: USER_ID,
        detalles: [{ month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 }],
        amount_bs: 0,
      })
    ).rejects.toThrow(messages.bolivares.montoBsRequerido);
  });

  it("sin imagen no llama a storage upload", async () => {
    fake.on("exchange_rates", "select").reply({ data: { rate_bs: 40 } });
    fake.on("payments", "insert").reply({ data: { id: PAGO_ID, status: "pendiente" } });
    fake.on("payment_detail", "insert").reply({
      data: [{ id: "det-1", month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 }],
    });
    fake.on("payment_bolivares", "insert").reply({ data: null });

    await service.crearPago({
      user_id: USER_ID,
      detalles: [{ month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 }],
      amount_bs: 1000,
    });

    expect(fake.callsTo("comprobantes", "upload")).toHaveLength(0);
    const payload = fake.callsTo("payment_bolivares", "insert")[0].payload as Array<Record<string, unknown>>;
    expect(payload[0].image_url).toBeNull();
  });
});

describe("BolivaresService.reconciliarPago", () => {
  beforeEach(() => {
    fake = createSupabaseFake();
    service = new BolivaresService(fake.client);
    fake.setUser({ id: ADMIN_ID, email: "admin@x.com" });
  });

  function prepararAdminYPago() {
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "select").reply({
      data: { id: PAGO_ID, user_id: USER_ID, status: "pendiente", payment_method: "bs" },
    });
  }

  it("rechaza si el usuario no es super_admin", async () => {
    fake.on("profiles", "select").reply({ data: { role: "miembro" } });
    await expect(service.reconciliarPago(PAGO_ID)).rejects.toThrow(messages.toast.noAutorizado);
  });

  it("rechaza si el pago no es de método bs", async () => {
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "select").reply({
      data: { id: PAGO_ID, user_id: USER_ID, status: "pendiente", payment_method: "efectivo" },
    });
    await expect(service.reconciliarPago(PAGO_ID)).rejects.toThrow(messages.bolivares.noEsPagoBs);
  });

  it("marca reconciled=true y aprueba si todos los grupos están cubiertos", async () => {
    prepararAdminYPago();
    fake.on("payment_bolivares", "update").reply({ data: null });
    // detalles del pago
    fake.on("payment_detail", "select").reply({
      data: [
        { month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 },
      ],
    });
    // config montos
    fake.on("gym_config_payment_methods", "select").reply({
      data: [{ payment_method: "bs", amount_monthly: 25, amount_inscription: 10, is_active: true }],
    });
    // suma reconciliada del grupo (25 >= 25 → cubierto)
    fake.on("payment_bolivares", "select").reply({
      data: [
        {
          amount_usd: 25,
          payment_detail: { month_number: 1, year_number: 2026, payment_type: "mensualidad" },
          payments: { user_id: USER_ID, status: "aprobado" },
        },
      ],
    });
    // aprobarInterno: update payments + select payment_detail (inscripcion check)
    fake.on("payments", "update").reply({ data: { id: PAGO_ID, status: "aprobado" } });
    fake.on("payment_detail", "select").reply({ data: [{ payment_type: "mensualidad" }] });
    // aprobarPendientesCubiertos: select payments pendientes → vacío
    fake.on("payments", "select").reply({ data: [] });
    // borrarImagenesDePago: select image_url → vacío (no storage remove)

    const resultado = await service.reconciliarPago(PAGO_ID);

    expect(resultado.aprobado).toBe(true);
    expect(resultado.restanteUsd).toBe(0);
    const upd = fake.callsTo("payment_bolivares", "update");
    expect(upd).toHaveLength(1);
    expect(upd[0].payload).toMatchObject({ reconciled: true });
    const pagosUpd = fake.callsTo("payments", "update");
    expect(pagosUpd.some((c) => (c.payload as { status?: string })?.status === "aprobado")).toBe(true);
  });

  it("NO aprueba si falta por cubrir (pago parcial) y devuelve el restante", async () => {
    prepararAdminYPago();
    fake.on("payment_bolivares", "update").reply({ data: null });
    fake.on("payment_detail", "select").reply({
      data: [{ month_number: 1, year_number: 2026, payment_type: "mensualidad", payment_amount: 25 }],
    });
    fake.on("gym_config_payment_methods", "select").reply({
      data: [{ payment_method: "bs", amount_monthly: 25, amount_inscription: 10, is_active: true }],
    });
    // solo 10 de 25 reconciliados
    fake.on("payment_bolivares", "select").reply({
      data: [
        {
          amount_usd: 10,
          payment_detail: { month_number: 1, year_number: 2026, payment_type: "mensualidad" },
          payments: { user_id: USER_ID, status: "pendiente" },
        },
      ],
    });

    const resultado = await service.reconciliarPago(PAGO_ID);

    expect(resultado.aprobado).toBe(false);
    expect(resultado.restanteUsd).toBe(15);
    expect(resultado.faltantes).toHaveLength(1);
    expect(resultado.faltantes[0].restante).toBe(15);
    // NO se actualizó payments a aprobado
    expect(fake.callsTo("payments", "update")).toHaveLength(0);
    // sí se marcó reconciled
    expect(fake.callsTo("payment_bolivares", "update")).toHaveLength(1);
  });

  it("rechaza si el pago no existe", async () => {
    fake.on("profiles", "select").reply({ data: { role: "super_admin" } });
    fake.on("payments", "select").reply({ data: null });
    await expect(service.reconciliarPago("no-existe")).rejects.toThrow(messages.bolivares.pagoNoEncontrado);
  });
});

describe("BolivaresService.imágenes", () => {
  beforeEach(() => {
    fake = createSupabaseFake();
    service = new BolivaresService(fake.client);
  });

  it("borrarImagenes elimina rutas únicas del bucket", async () => {
    fake.onStorage("comprobantes", "remove").reply({ data: [] });
    await service.borrarImagenes(["a.jpg", "a.jpg", "", "b.jpg"]);
    const removes = fake.callsTo("comprobantes", "remove");
    expect(removes).toHaveLength(1);
    expect(removes[0].payload).toEqual(["a.jpg", "b.jpg"]);
  });

  it("borrarImagenes no llama storage si no hay rutas", async () => {
    await service.borrarImagenes([]);
    await service.borrarImagenes(["", null as unknown as string]);
    expect(fake.callsTo("comprobantes", "remove")).toHaveLength(0);
  });

  it("borrarImagenesDePago lee image_url del pago y borra", async () => {
    fake.on("payment_bolivares", "select").reply({
      data: [{ image_url: "payments/p1/comprobante.jpg" }, { image_url: null }],
    });
    fake.onStorage("comprobantes", "remove").reply({ data: [] });
    await service.borrarImagenesDePago("p1");
    expect(fake.callsTo("comprobantes", "remove")[0].payload).toEqual([
      "payments/p1/comprobante.jpg",
    ]);
  });
});
