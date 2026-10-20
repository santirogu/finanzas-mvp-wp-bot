import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { botSetting, category, fixedPaymentSkip, transaction, whatsappLink, whatsappLinkCode } from "@/db/schema";
import { createUser } from "../../test/integration/factories";

// Las restricciones de la base (src/db/schema/) son la última defensa si el código falla: un monto
// negativo que se cuela desde el bot, dos cuentas con el mismo código de vinculación, un tope del bot
// imposible. Cada prueba intenta violar una y revisa que la base la rechace por esa restricción (y no
// por otra, como una clave foránea): si alguien la quita de una migración, la prueba falla.

/** El nombre de la restricción que rechazó el pedido, o null si la base lo aceptó. */
async function rejectedBy(query: PromiseLike<unknown>): Promise<string | null> {
  try {
    await query;
    return null;
  } catch (error) {
    const { cause } = error as { cause?: { constraint_name?: string } };
    return cause?.constraint_name ?? String(error);
  }
}

const expense = (userId: string, values: Partial<typeof transaction.$inferInsert> = {}) =>
  db.insert(transaction).values({ userId, type: "expense", amount: 1000, description: "Gasto", occurredOn: "2026-10-05", ...values });

describe("movimientos", () => {
  it("el monto es mayor que cero (transaction_amount_positive)", async () => {
    const user = await createUser();
    expect(await rejectedBy(expense(user.id, { amount: 0 }))).toBe("transaction_amount_positive");
    expect(await rejectedBy(expense(user.id, { amount: -50 }))).toBe("transaction_amount_positive");
    expect(await rejectedBy(expense(user.id, { amount: 0.01 }))).toBeNull();
  });

  it("un mensaje de WhatsApp se registra una sola vez (external_id único); sin él, los que sean", async () => {
    const user = await createUser();
    expect(await rejectedBy(expense(user.id, { externalId: "wamid.A:0" }))).toBeNull();
    expect(await rejectedBy(expense(user.id, { externalId: "wamid.A:0" }))).toBe("transaction_external_id_unique");
    expect(await rejectedBy(expense(user.id, { externalId: "wamid.A:1" }))).toBeNull();
    expect(await rejectedBy(expense(user.id))).toBeNull();
    expect(await rejectedBy(expense(user.id))).toBeNull();
  });
});

describe("configuración del bot", () => {
  const settings = (values: Partial<typeof botSetting.$inferInsert>) =>
    db.insert(botSetting).values({ aiPerHour: 20, aiPerDay: 100, ...values });

  it("una sola fila (bot_setting_single_row)", async () => {
    expect(await rejectedBy(settings({ id: 2 }))).toBe("bot_setting_single_row");
    expect(await rejectedBy(settings({ id: 1 }))).toBeNull();
  });

  it.each([
    [{ aiPerHour: 0 }],
    [{ aiPerHour: -1 }],
    // Por hora no puede ser más que por día.
    [{ aiPerHour: 101, aiPerDay: 100 }],
  ])("topes por cuenta posibles (bot_setting_ai_limits): %j no", async (values) => {
    expect(await rejectedBy(settings(values))).toBe("bot_setting_ai_limits");
  });

  it("el tope mensual es mayor que cero o no hay (bot_setting_monthly_token_limit)", async () => {
    expect(await rejectedBy(settings({ monthlyTokenLimit: 0 }))).toBe("bot_setting_monthly_token_limit");
    expect(await rejectedBy(settings({ monthlyTokenLimit: null }))).toBeNull();
  });
});

describe("vinculación de WhatsApp", () => {
  it("una cuenta tiene un solo número, y un número es de una sola cuenta", async () => {
    const ana = await createUser();
    const beto = await createUser();
    expect(await rejectedBy(db.insert(whatsappLink).values({ userId: ana.id, phone: "573001111111" }))).toBeNull();
    expect(await rejectedBy(db.insert(whatsappLink).values({ userId: ana.id, phone: "573002222222" }))).toBe(
      "whatsapp_link_user_id_unique",
    );
    expect(await rejectedBy(db.insert(whatsappLink).values({ userId: beto.id, phone: "573001111111" }))).toBe(
      "whatsapp_link_phone_unique",
    );
  });

  it("dos cuentas no pueden tener el mismo código pendiente (whatsapp_link_code_code_hash_unique)", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const code = (userId: string) =>
      db.insert(whatsappLinkCode).values({ userId, codeHash: "hash-del-mismo-codigo", expiresAt: new Date(Date.now() + 600_000) });
    expect(await rejectedBy(code(ana.id))).toBeNull();
    expect(await rejectedBy(code(beto.id))).toBe("whatsapp_link_code_code_hash_unique");
  });
});

describe("categorías", () => {
  it("una cuenta no repite el nombre en un mismo tipo; otra cuenta, u otro tipo, sí (category_user_type_name_uq)", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const mine = (userId: string, type: "income" | "expense") => db.insert(category).values({ userId, type, name: "Mascotas", emoji: "🐶" });
    expect(await rejectedBy(mine(ana.id, "expense"))).toBeNull();
    expect(await rejectedBy(mine(ana.id, "expense"))).toBe("category_user_type_name_uq");
    expect(await rejectedBy(mine(ana.id, "income"))).toBeNull();
    expect(await rejectedBy(mine(beto.id, "expense"))).toBeNull();
  });

  it("dos globales del mismo tipo no se llaman igual (category_global_type_name_uq)", async () => {
    // "Mercado" es una de las globales que repone la configuración de las pruebas.
    expect(await rejectedBy(db.insert(category).values({ userId: null, type: "expense", name: "Mercado", emoji: "🛒" }))).toBe(
      "category_global_type_name_uq",
    );
  });
});

describe("pagos que ya no aplican (avisos de próximos pagos)", () => {
  const skip = (userId: string, month: string) => db.insert(fixedPaymentSkip).values({ userId, descriptionKey: "arriendo", month });

  it("el mes es YYYY-MM (fixed_payment_skip_month)", async () => {
    const user = await createUser();
    expect(await rejectedBy(skip(user.id, "2026-13"))).toBe("fixed_payment_skip_month");
    expect(await rejectedBy(skip(user.id, "octubre"))).toBe("fixed_payment_skip_month");
    expect(await rejectedBy(skip(user.id, "2026-10"))).toBeNull();
  });

  it("una marca por gasto y mes de cada cuenta (fixed_payment_skip_user_key_month_uq)", async () => {
    const ana = await createUser();
    const beto = await createUser();
    expect(await rejectedBy(skip(ana.id, "2026-10"))).toBeNull();
    expect(await rejectedBy(skip(ana.id, "2026-10"))).toBe("fixed_payment_skip_user_key_month_uq");
    expect(await rejectedBy(skip(ana.id, "2026-09"))).toBeNull();
    expect(await rejectedBy(skip(beto.id, "2026-10"))).toBeNull();
  });
});
