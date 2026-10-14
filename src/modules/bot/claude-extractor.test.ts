import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SDK de Anthropic simulado: ninguna prueba llama a la API real ni gasta créditos.
const sdk = vi.hoisted(() => ({ parse: vi.fn(), clientOptions: [] as unknown[] }));
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    static APIError = actual.APIError;
    static AnthropicError = actual.AnthropicError;
    beta = { messages: { parse: sdk.parse } };
    constructor(options: unknown) {
      sdk.clientOptions.push(options);
    }
  }
  return { ...actual, default: FakeAnthropic };
});

const { APIError, AnthropicError } = await import("@anthropic-ai/sdk");
const { claudeExtractor } = await import("./claude-extractor");

const input = {
  text: "me compré unos zapatos de $500.000",
  today: { iso: "2026-10-13", long: "martes 13 de octubre de 2026" },
  categories: { expense: ["Ropa", "Otros"], income: ["Salario", "Otros"] },
};

const zapatos = {
  type: "expense" as const,
  amount: 500000,
  description: "Zapatos",
  category: "Ropa",
  date: "2026-10-13",
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    model: "claude-haiku-5-5",
    usage: { input_tokens: 1686, output_tokens: 59 },
    stop_reason: "end_turn",
    stop_details: null,
    parsed_output: { transactions: [zapatos], reply: null },
    ...overrides,
  };
}

beforeEach(() => {
  sdk.parse.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-prueba\n");
  vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
  vi.stubEnv("BOT_MODEL", "");
  vi.stubEnv("BOT_EFFORT", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("claudeExtractor", () => {
  it("sin API key no llama a Claude", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    expect(await claudeExtractor(input)).toEqual({ ok: false, reason: "not_configured" });
    expect(sdk.parse).not.toHaveBeenCalled();
  });

  it("devuelve los movimientos y el uso de tokens", async () => {
    sdk.parse.mockResolvedValue(response());

    expect(await claudeExtractor(input)).toEqual({
      ok: true,
      transactions: [zapatos],
      reply: null,
      usage: { model: "claude-haiku-5-5", inputTokens: 1686, outputTokens: 59 },
    });
  });

  it("crea el cliente con la key sin saltos de línea y un timeout corto", async () => {
    sdk.parse.mockResolvedValue(response());
    await claudeExtractor(input);

    expect(sdk.clientOptions[0]).toEqual({
      apiKey: "sk-ant-prueba",
      timeout: 30_000,
      maxRetries: 2,
    });
  });

  it("usa Haiku 5.5 con esfuerzo bajo, sin fallback de servidor, por defecto", async () => {
    sdk.parse.mockResolvedValue(response());
    await claudeExtractor(input);

    const params = sdk.parse.mock.calls[0][0];
    expect(params).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "low" } });
    expect(params.output_config.format).toBeDefined();
    expect(params).not.toHaveProperty("fallbacks");
    expect(params).not.toHaveProperty("betas");
  });

  it("envía las categorías en el system prompt y la fecha y el texto en el mensaje", async () => {
    sdk.parse.mockResolvedValue(response());
    await claudeExtractor(input);

    const params = sdk.parse.mock.calls[0][0];
    expect(params.system).toContain("Categorías de egreso: Ropa, Otros.");
    expect(params.system).toContain("Categorías de ingreso: Salario, Otros.");
    expect(params.messages).toEqual([
      {
        role: "user",
        content: expect.stringContaining("Hoy es martes 13 de octubre de 2026 (2026-10-13)."),
      },
    ]);
    expect(params.messages[0].content).toContain(`<mensaje>\n${input.text}\n</mensaje>`);
  });

  it("con BOT_MODEL de Opus activa el fallback del servidor ante rechazos", async () => {
    vi.stubEnv("BOT_MODEL", "claude-opus-5-5");
    vi.stubEnv("BOT_EFFORT", "medium");
    sdk.parse.mockResolvedValue(response({ model: "claude-opus-5-5" }));
    await claudeExtractor(input);

    expect(sdk.parse.mock.calls[0][0]).toMatchObject({
      model: "claude-opus-5-5",
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  });

  it("devuelve la pregunta de aclaración cuando no hay movimientos", async () => {
    sdk.parse.mockResolvedValue(
      response({ parsed_output: { transactions: [], reply: "¿Cuánto te costaron?" } }),
    );

    expect(await claudeExtractor(input)).toMatchObject({
      ok: true,
      transactions: [],
      reply: "¿Cuánto te costaron?",
    });
  });

  it("informa un rechazo de seguridad con su categoría", async () => {
    sdk.parse.mockResolvedValue(
      response({
        stop_reason: "refusal",
        stop_details: { category: "cyber" },
        parsed_output: null,
      }),
    );

    expect(await claudeExtractor(input)).toMatchObject({
      ok: false,
      reason: "refusal",
      detail: "cyber",
    });
  });

  it("informa una salida que no cumple el esquema", async () => {
    sdk.parse.mockResolvedValue(response({ stop_reason: "max_tokens", parsed_output: null }));

    expect(await claudeExtractor(input)).toMatchObject({
      ok: false,
      reason: "invalid_output",
      detail: "stop_reason=max_tokens",
    });
  });

  it("convierte los errores HTTP de la API en api_error con su estado", async () => {
    sdk.parse.mockRejectedValue(new APIError(529, {}, "Overloaded", new Headers()));

    const result = await claudeExtractor(input);
    expect(result).toMatchObject({ ok: false, reason: "api_error" });
    expect(!result.ok && result.detail).toContain("529");
  });

  it("convierte los errores del SDK (p. ej. de configuración) en api_error", async () => {
    sdk.parse.mockRejectedValue(new AnthropicError("Invalid credentials"));

    expect(await claudeExtractor(input)).toEqual({
      ok: false,
      reason: "api_error",
      detail: "Invalid credentials",
    });
  });

  it("deja pasar los errores inesperados del propio código", async () => {
    sdk.parse.mockRejectedValue(new TypeError("boom"));

    await expect(claudeExtractor(input)).rejects.toThrow("boom");
  });
});

describe("claudeExtractor · contrato con Claude", () => {
  async function format() {
    sdk.parse.mockResolvedValue(response());
    await claudeExtractor(input);
    return sdk.parse.mock.calls.at(-1)![0].output_config.format;
  }

  it("envía el esquema JSON exacto que Claude debe cumplir", async () => {
    const { type, schema } = await format();
    expect(type).toBe("json_schema");
    expect(schema).toMatchObject({
      type: "object",
      required: ["transactions", "reply"],
      additionalProperties: false,
      properties: {
        transactions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "amount", "description", "category", "date"],
            properties: {
              type: { type: "string", description: '{enum: ["income","expense"]}' },
              amount: {
                type: "number",
                description: "Monto en pesos colombianos: número entero, sin separadores",
              },
              description: { type: "string", description: "Qué fue, en 1 a 5 palabras" },
              category: {
                type: "string",
                description: "Una de las categorías de su tipo, o 'Otros'",
              },
              date: { type: "string", description: "Fecha del movimiento, YYYY-MM-DD" },
            },
          },
        },
        reply: {
          description: "Respuesta al usuario cuando no hay transacciones; null si las hay",
          anyOf: [expect.anything(), { type: "null" }],
        },
      },
    });
  });

  it("rechaza respuestas de Claude que no cumplen el esquema (p. ej. un tipo desconocido)", async () => {
    const { parse } = await format();
    const valid = { transactions: [zapatos], reply: null };
    expect(parse(JSON.stringify(valid))).toEqual(valid);
    expect(
      parse(JSON.stringify({ ...valid, transactions: [{ ...zapatos, type: "income" }] })),
    ).toBeTruthy();
    expect(() =>
      parse(JSON.stringify({ ...valid, transactions: [{ ...zapatos, type: "transfer" }] })),
    ).toThrow();
    expect(() => parse(JSON.stringify({ transactions: [] }))).toThrow();
  });
});

describe("claudeExtractor · credenciales y respuestas incompletas", () => {
  it("con ANTHROPIC_AUTH_TOKEN (sin API key) sí llama a Claude", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "token-oauth");
    sdk.parse.mockResolvedValue(response());

    expect(await claudeExtractor(input)).toMatchObject({ ok: true });
  });

  it("un rechazo sin detalles no rompe el extractor", async () => {
    sdk.parse.mockResolvedValue(
      response({ stop_reason: "refusal", stop_details: null, parsed_output: null }),
    );

    expect(await claudeExtractor(input)).toEqual({
      ok: false,
      reason: "refusal",
      detail: undefined,
      usage: { model: "claude-haiku-5-5", inputTokens: 1686, outputTokens: 59 },
    });
  });

  it("guarda el estado HTTP y el mensaje de error de la API", async () => {
    const error = new APIError(
      529,
      { error: { type: "overloaded_error" } },
      "Overloaded",
      new Headers(),
    );
    sdk.parse.mockRejectedValue(error);

    const result = await claudeExtractor(input);
    expect(result).toMatchObject({ ok: false, reason: "api_error" });
    expect(!result.ok && result.detail).toMatch(/^529 /);
  });

  // Falla conocida: el mensaje del SDK ya empieza con el estado ("529 {...}") y el extractor lo
  // antepone otra vez ("529 529 {...}"). Se corrige en una rama fix/; luego quitar `.fails`.
  it.fails("no duplica el estado HTTP en el detalle del error", async () => {
    const error = new APIError(
      529,
      { error: { type: "overloaded_error" } },
      "Overloaded",
      new Headers(),
    );
    sdk.parse.mockRejectedValue(error);

    const result = await claudeExtractor(input);
    expect(!result.ok && result.detail).toBe(error.message);
  });
});
