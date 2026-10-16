import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORIES } from "@/modules/transactions/default-categories";
import type { ExtractionResult, Extractor } from "./claude-extractor";
import { parseCommand } from "./commands";
import { interpretMessage } from "./interpret";
import { matchCategory, normalizeReply, normalizeTransactions, type CategoryNames } from "./normalize";
import { tooManyTransactionsReply } from "./replies";

const categories: CategoryNames = {
  expense: DEFAULT_CATEGORIES.expense.map((c) => c.name),
  income: DEFAULT_CATEGORIES.income.map((c) => c.name),
};
const ctx = { today: "2026-10-13", categories };
const usage = { model: "test", inputTokens: 0, outputTokens: 0 };

const fakeExtractor = (result: ExtractionResult) => vi.fn<Extractor>().mockResolvedValue(result);

describe("parseCommand", () => {
  it.each([
    ["balance", "balance"],
    ["Balance?", "balance"],
    ["saldo", "balance"],
    ["¿Cuánto llevo este mes?", "balance"],
    ["deshacer", "undo"],
    ["Borrar el último", "undo"],
    ["ayuda", "help"],
    ["Hola!", "help"],
    ["Buenos días", "help"],
  ])("%j → %s", (text, command) => {
    expect(parseCommand(text)).toEqual({ kind: "command", command });
  });

  it("reconoce el código de vinculación", () => {
    expect(parseCommand("VINCULAR 482913")).toEqual({ kind: "link", code: "482913" });
    expect(parseCommand("vincular 1234")).toBeNull();
  });

  it("no confunde un gasto con un comando", () => {
    expect(parseCommand("pagué el balance de la tarjeta 200.000")).toBeNull();
    expect(parseCommand("me compré unos zapatos de $500.000")).toBeNull();
  });
});

describe("normalizeTransactions", () => {
  const base = {
    type: "expense" as const,
    amount: 500000,
    description: "zapatos",
    category: "Ropa",
    date: "2026-10-13",
  };

  it("acepta una transacción válida y capitaliza la descripción", () => {
    expect(normalizeTransactions([base], ctx)).toEqual([
      {
        type: "expense",
        amount: 500000,
        description: "Zapatos",
        category: "Ropa",
        occurredOn: "2026-10-13",
      },
    ]);
  });

  it("descarta montos inválidos", () => {
    // 0,004 se redondea a 0 centavos.
    const items = [0, 0.004, -5000, -0.01, 1e15, Number.NaN, Number.POSITIVE_INFINITY].map((amount) => ({ ...base, amount }));
    expect(normalizeTransactions(items, ctx)).toEqual([]);
  });

  it("conserva los centavos y redondea lo que pase de dos decimales", () => {
    const amounts = [25900.5, 0.01, 0.005, 45900.555, 12500.4999, 0.1 + 0.2].map(
      (amount) => normalizeTransactions([{ ...base, amount }], ctx)[0].amount,
    );
    expect(amounts).toEqual([25900.5, 0.01, 0.01, 45900.56, 12500.5, 0.3]);
  });

  it("nunca guarda fechas futuras ni inválidas", () => {
    const [future, invalid, old] = normalizeTransactions(
      [
        { ...base, date: "2026-10-20" },
        { ...base, date: "13/10/2026" },
        { ...base, date: "2020-01-01" },
      ],
      ctx,
    );
    expect(future.occurredOn).toBe("2026-10-13");
    expect(invalid.occurredOn).toBe("2026-10-13");
    expect(old.occurredOn).toBe("2026-10-13");
  });

  it("respeta fechas pasadas razonables", () => {
    expect(normalizeTransactions([{ ...base, date: "2026-10-12" }], ctx)[0].occurredOn).toBe(
      "2026-10-12",
    );
  });

  it("reemplaza por hoy una fecha con mes inexistente", () => {
    expect(normalizeTransactions([{ ...base, date: "2026-13-01" }], ctx)[0].occurredOn).toBe(
      "2026-10-13",
    );
  });

  it.each(["2026-02-30", "2025-02-29", "2026-09-31"])(
    "reemplaza por hoy la fecha imposible %s",
    (date) => {
      expect(normalizeTransactions([{ ...base, date }], ctx)[0].occurredOn).toBe("2026-10-13");
    },
  );

  it("acepta el 29 de febrero en año bisiesto", () => {
    const leapCtx = { ...ctx, today: "2024-03-10" };
    expect(normalizeTransactions([{ ...base, date: "2024-02-29" }], leapCtx)[0].occurredOn).toBe(
      "2024-02-29",
    );
  });

  it("usa una descripción por defecto si viene vacía", () => {
    const [expense, income] = normalizeTransactions(
      [
        { ...base, description: "   " },
        { ...base, type: "income", description: "" },
      ],
      ctx,
    );
    expect(expense.description).toBe("Gasto");
    expect(income.description).toBe("Ingreso");
  });

  it("recorta descripciones largas a 140 caracteres y une espacios", () => {
    const [t] = normalizeTransactions(
      [{ ...base, description: `zapatos   de\n${"x".repeat(200)}` }],
      ctx,
    );
    expect(t.description).toHaveLength(140);
    expect(t.description.startsWith("Zapatos de x")).toBe(true);
  });

  it("descarta tipos desconocidos", () => {
    const raw = [{ ...base, type: "transfer" as unknown as "expense" }];
    expect(normalizeTransactions(raw, ctx)).toEqual([]);
  });

  it("usa la categoría del tipo correcto", () => {
    const [income] = normalizeTransactions([{ ...base, type: "income", category: "Ropa" }], ctx);
    expect(income.category).toBe("Otros");
  });
});

describe("matchCategory", () => {
  it("ignora mayúsculas y tildes", () => {
    expect(matchCategory("alimentacion", categories.expense)).toBe("Alimentación");
    expect(matchCategory("EDUCACIÓN", categories.expense)).toBe("Educación");
  });

  it("cae en 'Otros' si la categoría no existe", () => {
    expect(matchCategory("Mascotas", categories.expense)).toBe("Otros");
  });

  it("devuelve null si no existe la categoría ni 'Otros'", () => {
    expect(matchCategory("Mascotas", ["Ropa", "Mercado"])).toBeNull();
  });
});

describe("normalizeReply", () => {
  it("deja la respuesta en una línea y sin espacios de más", () => {
    expect(normalizeReply("  ¿Cuánto   fue?\n¿Y en qué?  ")).toBe("¿Cuánto fue? ¿Y en qué?");
  });

  it.each([null, undefined, "", "   \n "])("sin texto (%j) devuelve null", (text) => {
    expect(normalizeReply(text)).toBeNull();
  });

  it.each([
    "Verifica tu cuenta en https://evil.example/login",
    "entra a http://x.y",
    "Visita www.ejemplo.com.co",
    "Escribe a soporte@finanzas-falso.com",
    "Más info en nequi.co",
    "Detalles en algo.app/pago",
  ])("descarta una respuesta con enlace: %j", (text) => {
    expect(normalizeReply(text)).toBeNull();
  });

  it.each([
    "Registro ingresos y egresos, por ejemplo: gasté $20.000 en almuerzo.",
    "¿Fueron $45.900,50? p. ej. en el mercado",
    "Te costó 2.500 o 25.000?",
    "Una compañía, un combo y un comentario.",
  ])("no confunde texto normal con un enlace: %j", (text) => {
    expect(normalizeReply(text)).toBe(text);
  });

  it("recorta una respuesta larga en una palabra completa, con puntos suspensivos", () => {
    const long = "palabra ".repeat(60).trim();
    const reply = normalizeReply(long)!;
    expect(reply.length).toBeLessThanOrEqual(300);
    expect(reply.endsWith(" palabra…")).toBe(true);
    // Una de exactamente 300 caracteres queda igual.
    expect(normalizeReply("a".repeat(300))).toBe("a".repeat(300));
    // Sin espacios, corta en el carácter 299 y agrega los puntos.
    expect(normalizeReply("a".repeat(400))).toBe(`${"a".repeat(299)}…`);
  });

  it("busca enlaces después de recortar: un enlace que queda fuera no importa", () => {
    const text = `${"palabra ".repeat(40)}https://evil.example`;
    expect(normalizeReply(text)).toMatch(/…$/);
    expect(normalizeReply(text)).not.toContain("http");
  });
});

describe("interpretMessage", () => {
  it("con más de 20 movimientos en un mensaje no registra ninguno y pide dividirlo", async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      type: "expense" as const,
      amount: 1000 + i,
      description: `Gasto ${i}`,
      category: "Otros",
      date: "2026-10-13",
    }));
    const intent = await interpretMessage("muchos gastos", ctx, fakeExtractor({ ok: true, transactions: many, reply: null, usage }));
    expect(intent).toEqual({ kind: "reply", text: tooManyTransactionsReply(20), usage });

    const twenty = await interpretMessage(
      "veinte gastos",
      ctx,
      fakeExtractor({ ok: true, transactions: many.slice(0, 20), reply: null, usage }),
    );
    expect(twenty).toMatchObject({ kind: "transactions" });
    expect((twenty as { items: unknown[] }).items).toHaveLength(20);
  });

  it("la respuesta libre del modelo pasa por normalizeReply: con un enlace, usa la fija", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: "Verifica tu cuenta en http://evil.example", usage });
    const intent = await interpretMessage("¿cuál es la capital de Francia?", ctx, extractor);
    expect(intent).toMatchObject({ kind: "reply" });
    expect((intent as { text: string }).text).not.toContain("http");
    expect((intent as { text: string }).text).toContain("gasté $20.000 en almuerzo");
  });

  it("resuelve comandos sin llamar a la IA", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: null, usage });
    expect(await interpretMessage("balance", ctx, extractor)).toEqual({
      kind: "command",
      command: "balance",
    });
    expect(extractor).not.toHaveBeenCalled();
  });

  it("pasa la fecha de hoy y las categorías al extractor", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: "¿Cuánto fue?", usage });
    await interpretMessage("me compré unos zapatos", ctx, extractor);
    expect(extractor).toHaveBeenCalledWith({
      text: "me compré unos zapatos",
      today: { iso: "2026-10-13", long: "martes 13 de octubre de 2026" },
      categories,
    });
  });

  it("devuelve las transacciones validadas", async () => {
    const extractor = fakeExtractor({
      ok: true,
      transactions: [
        {
          type: "expense",
          amount: 500000,
          description: "Zapatos",
          category: "Ropa",
          date: "2026-10-13",
        },
      ],
      reply: null,
      usage,
    });
    const intent = await interpretMessage(
      "me compré unos zapatos que me costaron $500.000",
      ctx,
      extractor,
    );
    expect(intent).toMatchObject({
      kind: "transactions",
      items: [{ type: "expense", amount: 500000, description: "Zapatos", category: "Ropa" }],
    });
  });

  it("devuelve la pregunta de aclaración de la IA", async () => {
    const extractor = fakeExtractor({
      ok: true,
      transactions: [],
      reply: "¿Cuánto te costaron?",
      usage,
    });
    expect(await interpretMessage("me compré unos zapatos", ctx, extractor)).toMatchObject({
      kind: "reply",
      text: "¿Cuánto te costaron?",
    });
  });

  it("pide el monto si la IA propuso uno inválido", async () => {
    const extractor = fakeExtractor({
      ok: true,
      transactions: [
        {
          type: "expense",
          amount: 0,
          description: "Zapatos",
          category: "Ropa",
          date: "2026-10-13",
        },
      ],
      reply: null,
      usage,
    });
    expect(await interpretMessage("zapatos", ctx, extractor)).toMatchObject({ kind: "reply" });
  });

  it("indica cuando la IA no está configurada (sin API key)", async () => {
    const extractor = fakeExtractor({ ok: false, reason: "not_configured" });
    expect(await interpretMessage("gasté 20 mil", ctx, extractor)).toMatchObject({
      kind: "error",
      reason: "not_configured",
    });
  });

  it("responde sin llamar a la IA si el mensaje es demasiado largo", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: null, usage });
    const intent = await interpretMessage("gasté ".repeat(200), ctx, extractor);
    expect(intent).toMatchObject({ kind: "reply", text: expect.stringContaining("muy largo") });
    expect(extractor).not.toHaveBeenCalled();
  });

  it("un mensaje vacío muestra la ayuda", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: null, usage });
    expect(await interpretMessage("   ", ctx, extractor)).toEqual({
      kind: "command",
      command: "help",
    });
  });

  it("usa una respuesta por defecto si la IA no da ni movimientos ni texto", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: null, usage });
    expect(await interpretMessage("algo raro", ctx, extractor)).toMatchObject({
      kind: "reply",
      text: expect.stringContaining("gasté $20.000 en almuerzo"),
    });
  });

  it("reporta errores de la API sin lanzar excepción", async () => {
    const extractor = fakeExtractor({ ok: false, reason: "api_error", detail: "529 overloaded" });
    expect(await interpretMessage("gasté 20 mil", ctx, extractor)).toEqual({
      kind: "error",
      reason: "api_error: 529 overloaded",
      usage: undefined,
    });
  });
});

describe("parseCommand · solo comandos exactos", () => {
  it.each([
    "mi balance de la tarjeta",
    "ver mi balance",
    "necesito ayuda con algo",
    "ayuda por favor",
    "deshacer el gasto de ayer",
    "quiero deshacer",
    "vincular 123456 por favor",
    "por favor vincular 123456",
    "cuanto llevo gastado en ropa",
  ])("%j no es un comando (lo interpreta la IA)", (text) => {
    expect(parseCommand(text)).toBeNull();
  });

  it("acepta variaciones de los comandos", () => {
    expect(parseCommand("deshacer último")).toEqual({ kind: "command", command: "undo" });
    expect(parseCommand("¡¡Balance!!")).toEqual({ kind: "command", command: "balance" });
    expect(parseCommand("vincular   482913")).toEqual({ kind: "link", code: "482913" });
  });
});

describe("interpretMessage · límites y respuestas", () => {
  it("acepta mensajes de hasta 1.000 caracteres", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: "¿Cuánto?", usage });
    await interpretMessage("a".repeat(1000), ctx, extractor);
    expect(extractor).toHaveBeenCalled();
  });

  it("si la IA propuso un monto inválido, pregunta exactamente por el monto", async () => {
    const extractor = fakeExtractor({
      ok: true,
      transactions: [
        {
          type: "expense",
          amount: 0,
          description: "Zapatos",
          category: "Ropa",
          date: "2026-10-13",
        },
      ],
      reply: "texto de la IA que no debe usarse",
      usage,
    });
    expect(await interpretMessage("zapatos", ctx, extractor)).toMatchObject({
      kind: "reply",
      text: "No entendí el monto. ¿Cuánto fue exactamente?",
    });
  });

  it("recorta los espacios de la respuesta de la IA", async () => {
    const extractor = fakeExtractor({
      ok: true,
      transactions: [],
      reply: "  ¿Cuánto te costaron?  ",
      usage,
    });
    expect(await interpretMessage("me compré algo", ctx, extractor)).toMatchObject({
      text: "¿Cuánto te costaron?",
    });
  });
});

describe("normalizeTransactions · límites", () => {
  const base = {
    type: "expense" as const,
    amount: 1000,
    description: "x",
    category: "Ropa",
    date: "2026-10-13",
  };

  it("acepta fechas de hasta 366 días atrás", () => {
    const [ok] = normalizeTransactions([{ ...base, date: "2025-10-12" }], ctx);
    const [old] = normalizeTransactions([{ ...base, date: "2025-10-11" }], ctx);
    expect(ok.occurredOn).toBe("2025-10-12");
    expect(old.occurredOn).toBe("2026-10-13");
  });

  it("acepta el monto máximo y rechaza lo que lo supera", () => {
    expect(normalizeTransactions([{ ...base, amount: 100_000_000_000 }], ctx)).toHaveLength(1);
    expect(normalizeTransactions([{ ...base, amount: 100_000_000_000.004 }], ctx)).toHaveLength(1);
    expect(normalizeTransactions([{ ...base, amount: 100_000_000_000.01 }], ctx)).toEqual([]);
    expect(normalizeTransactions([{ ...base, amount: 100_000_000_001 }], ctx)).toEqual([]);
  });

  it("reconoce la categoría aunque venga con espacios", () => {
    expect(matchCategory("  ropa  ", categories.expense)).toBe("Ropa");
  });
});
