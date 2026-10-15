import { describe, expect, it } from "vitest";
import { newTransactionSchema } from "./validation";

const base = {
  type: "expense",
  amount: "500.000",
  description: "Zapatos",
  categoryId: "",
  occurredOn: "2026-10-13",
};

const errorsOf = (input: Record<string, unknown>) => {
  const result = newTransactionSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
};

describe("newTransactionSchema", () => {
  it("convierte el monto colombiano a número y la categoría vacía a undefined", () => {
    expect(newTransactionSchema.parse(base)).toEqual({
      type: "expense",
      amount: 500000,
      description: "Zapatos",
      categoryId: undefined,
      occurredOn: "2026-10-13",
    });
  });

  it("acepta una categoría con UUID válido y recorta espacios de la descripción", () => {
    const id = "2aaa4004-699a-44e7-94c0-62209191e890";
    expect(
      newTransactionSchema.parse({ ...base, categoryId: id, description: "  Zapatos  " }),
    ).toMatchObject({ categoryId: id, description: "Zapatos" });
  });

  it.each([
    ["45.900,50", 45900.5],
    ["45.900,5", 45900.5],
    ["0,01", 0.01],
    ["100.000.000.000", 100000000000],
  ])("acepta centavos y hasta el máximo: %j → %d", (amount, expected) => {
    expect(newTransactionSchema.parse({ ...base, amount }).amount).toBe(expected);
  });

  it.each(["100.000.000.000,01", "250.000.000.000"])("rechaza un monto por encima del máximo: %j", (amount) => {
    expect(errorsOf({ ...base, amount })).toHaveProperty("amount", "El monto no puede pasar de $100.000.000.000,00");
  });

  it.each(["0", "", "abc", "0,00", "1,500"])("rechaza el monto %j", (amount) => {
    expect(errorsOf({ ...base, amount })).toHaveProperty(
      "amount",
      "Ingresa un monto mayor que cero",
    );
  });

  it.each(["-5.000", "$-5.000", "- 5.000", "-$5.000"])("rechaza el monto negativo %j", (amount) => {
    expect(errorsOf({ ...base, amount })).toHaveProperty(
      "amount",
      "Ingresa un monto mayor que cero",
    );
  });

  it.each(["2026-02-30", "2025-02-29", "2026-04-31"])(
    "rechaza la fecha imposible %j",
    (occurredOn) => {
      expect(errorsOf({ ...base, occurredOn })).toHaveProperty("occurredOn", "Fecha inválida");
    },
  );

  it("rechaza descripciones vacías o de más de 140 caracteres", () => {
    expect(errorsOf({ ...base, description: "   " })).toHaveProperty(
      "description",
      "Agrega una descripción",
    );
    expect(errorsOf({ ...base, description: "a".repeat(141) })).toHaveProperty(
      "description",
      "Máximo 140 caracteres",
    );
    expect(errorsOf({ ...base, description: "a".repeat(140) })).toEqual({});
  });

  it.each(["13/10/2026", "2026-13-01", "ayer", ""])("rechaza la fecha %j", (occurredOn) => {
    expect(errorsOf({ ...base, occurredOn })).toHaveProperty("occurredOn", "Fecha inválida");
  });

  it("rechaza categorías que no son UUID y tipos desconocidos", () => {
    expect(errorsOf({ ...base, categoryId: "ropa" })).toHaveProperty("categoryId");
    expect(errorsOf({ ...base, type: "transfer" })).toHaveProperty("type");
  });
});

describe("newTransactionSchema · ingresos y mensajes", () => {
  it("acepta ingresos", () => {
    expect(newTransactionSchema.parse({ ...base, type: "income" }).type).toBe("income");
  });

  it("explica que la categoría debe elegirse de la lista", () => {
    expect(errorsOf({ ...base, categoryId: "ropa" })).toHaveProperty(
      "categoryId",
      "Selecciona una categoría",
    );
  });
});
