import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORIES } from "@/modules/transactions/default-categories";
import type { ExtractionResult, Extractor } from "./claude-extractor";
import { parseCommand } from "./commands";
import { interpretMessage, interpretPhoto } from "./interpret";
import { matchCategory, normalizeReply, normalizeTransactions, type CategoryNames } from "./normalize";
import { photoFallbackReply, photoManyReply, photoUnreadableReply, tooManyTransactionsReply } from "./replies";

const categories: CategoryNames = {
  expense: DEFAULT_CATEGORIES.expense.map((c) => c.name),
  income: DEFAULT_CATEGORIES.income.map((c) => c.name),
};
const ctx = { today: "2026-10-13", categories, locale: "es" } as const;
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
    expect(parseCommand("VINCULAR 482913")).toEqual({ kind: "link", code: "482913", locale: "es" });
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

  it("quita los caracteres de control de la descripción que propone la IA", () => {
    const [item] = normalizeTransactions([{ ...base, description: "zap\u0000atos\u001b[31m" }], ctx);
    expect(item.description).toBe("Zapatos[31m");
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

  it("con un límite propio (el de las fotos), la fecha vale solo hasta esos días atrás", () => {
    const month = { ...ctx, maxDaysBack: 31 };
    expect(normalizeTransactions([{ ...base, date: "2026-09-12" }], month)[0].occurredOn).toBe("2026-09-12");
    expect(normalizeTransactions([{ ...base, date: "2026-09-11" }], month)[0].occurredOn).toBe("2026-10-13");
    expect(normalizeTransactions([{ ...base, date: "2026-10-14" }], month)[0].occurredOn).toBe("2026-10-13");
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

  // Lo que propone Claude puede venir mal formado: un mes 00 o 13 en un año que ya pasó (la regla de las
  // fechas futuras no lo tapa) o con algo de más alrededor. Nunca se guarda tal cual.
  it.each(["2025-13-01", "2026-00-10", " 2026-10-12", "2026-10-12 ", "02026-10-12", "2026-10-12-1", "x2026-10-12", "2026-10-12x"])(
    "reemplaza por hoy la fecha mal formada %j",
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
    // En una cuenta en inglés, en inglés.
    const english = normalizeTransactions(
      [
        { ...base, description: "" },
        { ...base, type: "income", description: " " },
      ],
      { ...ctx, locale: "en" },
    );
    expect(english.map((t) => t.description)).toEqual(["Expense", "Income"]);
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

  it.each([
    ['Envíame el movimiento completo, por ejemplo "almuerzo 20 mil".', "Envíame el movimiento completo, por ejemplo “almuerzo 20 mil”."],
    ['Escribe "balance" o "balance septiembre".', "Escribe “balance” o “balance septiembre”."],
    ['Una sola comilla: 5" queda igual.', 'Una sola comilla: 5" queda igual.'],
    ['Pares y una suelta: "uno" y 2"', 'Pares y una suelta: “uno” y 2"'],
  ])("las comillas rectas, en pareja, pasan a “ ”: %j", (text, expected) => {
    expect(normalizeReply(text)).toBe(expected);
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
    expect(intent).toEqual({ kind: "reply", text: tooManyTransactionsReply(20, "es"), usage });

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
    expect((intent as { text: string }).text).toContain("gasté 20 mil en almuerzo");
  });

  it("resuelve comandos sin llamar a la IA", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: null, usage });
    expect(await interpretMessage("balance", ctx, extractor)).toEqual({
      kind: "command",
      command: "balance",
    });
    expect(extractor).not.toHaveBeenCalled();
  });

  it("pasa la fecha de hoy, las categorías y el idioma de la cuenta al extractor", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: "¿Cuánto fue?", usage });
    await interpretMessage("me compré unos zapatos", ctx, extractor);
    expect(extractor).toHaveBeenCalledWith({
      text: "me compré unos zapatos",
      today: { iso: "2026-10-13", long: "martes 13 de octubre de 2026" },
      categories,
      locale: "es",
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
      text: expect.stringContaining("gasté 20 mil en almuerzo"),
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
    expect(parseCommand("vincular   482913")).toEqual({ kind: "link", code: "482913", locale: "es" });
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
      text: "No entendí el monto. Escríbeme el movimiento completo con su monto, por ejemplo “almuerzo 25 mil”.",
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

  it("con un límite propio (el de las fotos), la fecha vale solo hasta esos días atrás", () => {
    const month = { ...ctx, maxDaysBack: 31 };
    expect(normalizeTransactions([{ ...base, date: "2026-09-12" }], month)[0].occurredOn).toBe("2026-09-12");
    expect(normalizeTransactions([{ ...base, date: "2026-09-11" }], month)[0].occurredOn).toBe("2026-10-13");
    expect(normalizeTransactions([{ ...base, date: "2026-10-14" }], month)[0].occurredOn).toBe("2026-10-13");
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

describe("interpretPhoto", () => {
  const image = { data: "aGVsbG8=", mediaType: "image/jpeg" as const };
  const receipt = { type: "expense" as const, amount: 85400, description: "éxito", category: "Mercado", date: "2026-10-11" };
  const ok = (transactions: (typeof receipt)[], reply: string | null = null): ExtractionResult => ({ ok: true, transactions, reply, usage });

  it("manda la foto, lo que escribió con ella, la fecha de hoy, las categorías y el idioma", async () => {
    const extractor = fakeExtractor(ok([receipt]));
    await interpretPhoto({ image, caption: "  mercado del mes " }, ctx, extractor);
    expect(extractor).toHaveBeenCalledWith({
      text: "mercado del mes",
      image,
      today: { iso: "2026-10-13", long: "martes 13 de octubre de 2026" },
      categories,
      locale: "es",
    });
  });

  it("sin texto manda la foto sola", async () => {
    const extractor = fakeExtractor(ok([receipt]));
    await interpretPhoto({ image, caption: null }, ctx, extractor);
    expect(extractor.mock.calls[0][0]).toMatchObject({ text: "", image });
  });

  it("registra un egreso con el total y la fecha impresa, si es del último mes", async () => {
    const intent = await interpretPhoto({ image, caption: null }, ctx, fakeExtractor(ok([receipt])));
    expect(intent).toEqual({
      kind: "transactions",
      items: [{ type: "expense", amount: 85400, description: "Éxito", category: "Mercado", occurredOn: "2026-10-11" }],
      usage,
    });
  });

  it("una factura de hace más de un mes (o con fecha futura) queda con la fecha de hoy", async () => {
    for (const date of ["2026-09-11", "2025-10-13", "2026-11-02"]) {
      const intent = await interpretPhoto({ image, caption: null }, ctx, fakeExtractor(ok([{ ...receipt, date }])));
      expect(intent.kind === "transactions" && intent.items[0].occurredOn, date).toBe("2026-10-13");
    }
  });

  it("los comandos en el texto de una foto no se ejecutan: van como pista a la IA", async () => {
    const extractor = fakeExtractor(ok([receipt]));
    const intent = await interpretPhoto({ image, caption: "deshacer" }, ctx, extractor);
    expect(intent.kind).toBe("transactions");
    expect(extractor).toHaveBeenCalledOnce();
  });

  it("si la IA propone varios movimientos, no registra ninguno y pide una factura por foto", async () => {
    const intent = await interpretPhoto({ image, caption: null }, ctx, fakeExtractor(ok([receipt, { ...receipt, amount: 1200 }])));
    expect(intent).toEqual({ kind: "reply", text: photoManyReply("es"), usage });
  });

  it("si el total no pasa la validación, pide una foto más clara", async () => {
    const intent = await interpretPhoto({ image, caption: null }, ctx, fakeExtractor(ok([{ ...receipt, amount: 0 }])));
    expect(intent).toEqual({ kind: "reply", text: photoUnreadableReply("es"), usage });
  });

  it("si no es una factura, responde lo que dijo la IA (normalizado) o una respuesta fija", async () => {
    const said = await interpretPhoto({ image, caption: null }, ctx, fakeExtractor(ok([], 'Es una foto de un perro. Escríbeme el gasto, por ejemplo "almuerzo 25 mil".')));
    expect(said).toEqual({ kind: "reply", text: "Es una foto de un perro. Escríbeme el gasto, por ejemplo “almuerzo 25 mil”.", usage });
    const withLink = await interpretPhoto({ image, caption: null }, ctx, fakeExtractor(ok([], "Revisa www.estafa.co")));
    expect(withLink).toEqual({ kind: "reply", text: photoFallbackReply("es"), usage });
    const empty = await interpretPhoto({ image, caption: null }, ctx, fakeExtractor(ok([], null)));
    expect(empty).toEqual({ kind: "reply", text: photoFallbackReply("es"), usage });
  });

  it("con un texto de más de 1.000 caracteres no llama a la IA", async () => {
    const extractor = fakeExtractor(ok([receipt]));
    expect(await interpretPhoto({ image, caption: "x".repeat(1001) }, ctx, extractor)).toEqual({
      kind: "reply",
      text: "Tu mensaje es muy largo. Envíamelo en partes más cortas.",
    });
    expect(extractor).not.toHaveBeenCalled();
    await interpretPhoto({ image, caption: "x".repeat(1000) }, ctx, extractor);
    expect(extractor).toHaveBeenCalledOnce();
  });

  it("devuelve los errores de la IA como en los textos", async () => {
    const intent = await interpretPhoto({ image, caption: null }, ctx, fakeExtractor({ ok: false, reason: "api_error", detail: "529 overloaded" }));
    expect(intent).toEqual({ kind: "error", reason: "api_error: 529 overloaded", usage: undefined });
    expect(await interpretPhoto({ image, caption: null }, ctx, fakeExtractor({ ok: false, reason: "rate_limited" }))).toEqual({
      kind: "error",
      reason: "rate_limited",
      usage: undefined,
    });
  });
});

// En una cuenta en inglés, las respuestas fijas del intérprete van en inglés; lo que escribe Claude, tal cual.
describe("interpretMessage e interpretPhoto · en inglés", () => {
  const en = { ...ctx, locale: "en" } as const;
  const shoes = { type: "expense" as const, amount: 0, description: "Shoes", category: "Ropa", date: "2026-10-13" };

  it("los comandos en inglés no llaman a la IA", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: null, usage });
    expect(await interpretMessage("report 2025", en, extractor)).toEqual({ kind: "command", command: "report", period: { year: 2025 } });
    expect(await interpretMessage("deshacer", en, extractor)).toEqual({ kind: "command", command: "undo" });
    expect(extractor).not.toHaveBeenCalled();
  });

  it("muy largo, demasiados movimientos, sin monto o sin entender nada", async () => {
    const none = fakeExtractor({ ok: true, transactions: [], reply: null, usage });
    expect(await interpretMessage("spent ".repeat(200), en, none)).toEqual({ kind: "reply", text: "Your message is too long. Send it to me in shorter parts." });
    const many = Array.from({ length: 21 }, (_, i) => ({ ...shoes, amount: 1000 + i }));
    expect(await interpretMessage("a lot", en, fakeExtractor({ ok: true, transactions: many, reply: null, usage }))).toEqual({
      kind: "reply",
      text: tooManyTransactionsReply(20, "en"),
      usage,
    });
    expect(await interpretMessage("shoes", en, fakeExtractor({ ok: true, transactions: [shoes], reply: null, usage }))).toMatchObject({
      text: "I didn't understand the amount. Send me the whole transaction with its amount, for example “lunch 25k”.",
    });
    expect(await interpretMessage("hmm", en, none)).toMatchObject({
      text: "I couldn't find any income or expense in your message. Try something like “spent 20k on lunch”.",
    });
  });

  it("le pasa el idioma de la cuenta a Claude, con un mensaje y con una foto (escribe la respuesta en inglés)", async () => {
    const extractor = fakeExtractor({ ok: true, transactions: [], reply: "Send me the whole transaction, like “sneakers 180k”.", usage });
    expect(await interpretMessage("I bought some sneakers", en, extractor)).toEqual({
      kind: "reply",
      text: "Send me the whole transaction, like “sneakers 180k”.",
      usage,
    });
    await interpretPhoto({ image: { data: "", mediaType: "image/png" }, caption: "lunch" }, en, extractor);
    expect(extractor.mock.calls.map(([input]) => input.locale)).toEqual(["en", "en"]);
  });

  it("las fotos que no se registraron", async () => {
    const photo = { image: { data: "", mediaType: "image/png" as const }, caption: null };
    const said = (transactions: (typeof shoes)[]) => fakeExtractor({ ok: true, transactions, reply: null, usage });
    expect(await interpretPhoto(photo, en, said([shoes, shoes]))).toEqual({ kind: "reply", text: photoManyReply("en"), usage });
    expect(await interpretPhoto(photo, en, said([shoes]))).toEqual({ kind: "reply", text: photoUnreadableReply("en"), usage });
    expect(await interpretPhoto(photo, en, said([]))).toEqual({ kind: "reply", text: photoFallbackReply("en"), usage });
  });
});
