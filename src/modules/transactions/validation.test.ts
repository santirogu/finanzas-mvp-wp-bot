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
  it("convierte el monto colombiano a entero y la categoría vacía a undefined", () => {
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

  it.each(["0", "", "abc"])("rechaza el monto %j", (amount) => {
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
