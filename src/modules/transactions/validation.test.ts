import { describe, expect, it } from "vitest";
import { newTransactionSchema, transactionSchema } from "./validation";

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

  it.each(["-5.000", "$-5.000", "- 5.000", "-$5.000", "−$5.000", "–5.000", "—$5.000"])("rechaza el monto negativo %j", (amount) => {
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

  it("quita los caracteres de control de la descripción (el nulo haría fallar la base)", () => {
    expect(newTransactionSchema.parse({ ...base, description: "Zap\u0000atos\u0007 " }).description).toBe("Zapatos");
    // Si solo tenía caracteres de control, queda vacía y se pide una.
    expect(errorsOf({ ...base, description: "\u0000\u0000" })).toHaveProperty("description", "Agrega una descripción");
  });

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

describe("transactionSchema · en inglés", () => {
  const base = { type: "expense", amount: "1,250,000.50", description: "Shoes", categoryId: "", occurredOn: "2026-10-13" };

  it("lee el monto con la coma de miles y el punto de centavos", () => {
    expect(transactionSchema("en").parse(base).amount).toBe(1250000.5);
    expect(transactionSchema("en").safeParse({ ...base, amount: "1.250.000,50" }).success).toBe(false);
  });

  it("los mensajes, en inglés", () => {
    const result = transactionSchema("en").safeParse({ ...base, amount: "0", description: " ", categoryId: "x", occurredOn: "2026-13-01" });
    expect(result.success).toBe(false);
    expect(Object.fromEntries(result.error!.issues.map((issue) => [issue.path[0], issue.message]))).toEqual({
      amount: "Enter an amount greater than zero",
      description: "Add a description",
      categoryId: "Pick a category",
      occurredOn: "Invalid date",
    });
    expect(transactionSchema("en").safeParse({ ...base, amount: "100,000,000,000.01" }).error?.issues[0].message).toBe(
      "The amount can't be more than $100,000,000,000.00",
    );
    expect(transactionSchema("en").safeParse({ ...base, description: "x".repeat(141) }).error?.issues[0].message).toBe("At most 140 characters");
  });
});
