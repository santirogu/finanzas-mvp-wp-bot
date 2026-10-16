import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { CategoryNames, RawTransaction } from "./normalize";
import { buildSystemPrompt, buildUserMessage } from "./prompt";
import { envVar } from "@/lib/env";
import { serviceUrl } from "@/lib/service-url";

// Modelo configurable por entorno. Por defecto Claude Haiku 5.5 con esfuerzo bajo:
// en el set de evaluación acertó 50/50, más rápido y ~40 veces más barato que Opus 5.5.
// Para cambiarlo: BOT_MODEL=claude-opus-5-5 (y comparar antes con `pnpm bot:eval`).
export const botModel = () => envVar("BOT_MODEL") || "claude-haiku-5-5";
const botEffort = () => (envVar("BOT_EFFORT") || "low") as "low" | "medium" | "high";

const extractionSchema = z.object({
  transactions: z.array(
    z.object({
      type: z.enum(["income", "expense"]),
      amount: z.number().describe("Monto en pesos colombianos, con los centavos como decimales (máximo 2) y sin separadores de miles: 25900.5"),
      description: z.string().describe("Qué fue, en 1 a 5 palabras"),
      category: z.string().describe("Una de las categorías de su tipo, o 'Otros'"),
      date: z.string().describe("Fecha del movimiento, YYYY-MM-DD"),
    }),
  ),
  reply: z
    .string()
    .nullable()
    .describe("Respuesta al usuario cuando no hay transacciones; null si las hay"),
});

export type ExtractionInput = {
  text: string;
  today: { iso: string; long: string };
  categories: CategoryNames;
};

export type ExtractionResult =
  | { ok: true; transactions: RawTransaction[]; reply: string | null; usage: Usage }
  | {
      ok: false;
      // rate_limited: la cuenta usó su cupo de mensajes interpretados (no se llamó a Claude).
      reason: "not_configured" | "refusal" | "invalid_output" | "api_error" | "rate_limited";
      detail?: string;
      usage?: Usage;
    };

export type Usage = { model: string; inputTokens: number; outputTokens: number };

export type Extractor = (input: ExtractionInput) => Promise<ExtractionResult>;

let client: Anthropic | null = null;
function getClient() {
  // Toma ANTHROPIC_API_KEY del entorno. Timeout corto: es una conversación de WhatsApp.
  // ANTHROPIC_BASE_URL (que el SDK leería solo) únicamente puede apuntar a un servidor local: las
  // pruebas E2E usan uno falso, y la API key nunca debe ir a otro host.
  client ??= new Anthropic({
    apiKey: envVar("ANTHROPIC_API_KEY"),
    baseURL: serviceUrl("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
    timeout: 30_000,
    maxRetries: 2,
  });
  return client;
}

// Los modelos Haiku no tienen fallback del lado del servidor.
const supportsServerFallback = (model: string) => !model.includes("haiku");

export const claudeExtractor: Extractor = async ({ text, today, categories }) => {
  // Sin credenciales el SDK lanza un Error genérico; mejor detectarlo antes.
  if (!envVar("ANTHROPIC_API_KEY") && !envVar("ANTHROPIC_AUTH_TOKEN")) {
    return { ok: false, reason: "not_configured" };
  }
  const model = botModel();
  try {
    const response = await getClient().beta.messages.parse({
      model,
      // Alcanza para MAX_TRANSACTIONS_PER_MESSAGE movimientos; acota el costo de cada llamada.
      max_tokens: 2048,
      system: buildSystemPrompt(categories),
      messages: [{ role: "user", content: buildUserMessage(text, today) }],
      output_config: { effort: botEffort(), format: betaZodOutputFormat(extractionSchema) },
      // Si un clasificador de seguridad rechaza el mensaje, el servidor reintenta
      // con el modelo recomendado en lugar de devolver el rechazo.
      ...(supportsServerFallback(model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });

    const usage: Usage = {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        reason: "refusal",
        detail: response.stop_details?.category ?? undefined,
        usage,
      };
    }
    if (!response.parsed_output) {
      return {
        ok: false,
        reason: "invalid_output",
        detail: `stop_reason=${response.stop_reason}`,
        usage,
      };
    }
    return {
      ok: true,
      transactions: response.parsed_output.transactions,
      reply: response.parsed_output.reply,
      usage,
    };
  } catch (error) {
    // Errores de la API (el SDK ya pone el estado HTTP al inicio del mensaje: "529 {...}") y del
    // SDK antes de llamarla, p. ej. si no puede conectarse o falta ANTHROPIC_API_KEY.
    if (error instanceof Anthropic.AnthropicError) {
      return { ok: false, reason: "api_error", detail: error.message };
    }
    throw error;
  }
};
