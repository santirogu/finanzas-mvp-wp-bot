import { formatMoney } from "@/lib/money";

// El costo estimado de Claude en dólares (/admin/bot): los tokens que guarda cada mensaje por el precio
// público de su modelo. Es un estimado: el cobro real está en la consola de Anthropic, y si los precios
// cambian o el bot usa otro modelo, hay que actualizar esta tabla (una prueba exige que el modelo por
// defecto del bot tenga precio).

/** De dónde salen los precios y cuándo se revisaron. */
export const PRICES_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
export const PRICES_CHECKED_ON = "2026-10-19";

/** Precio en dólares por millón de tokens. */
type Rate = { input: number; output: number };
/**
 * `long`: Haiku 5.5 cobra más cuando el prompt (los tokens de entrada) pasa de `above`; cada llamada se
 * cobra por su propio largo.
 */
type Price = Rate & { long?: Rate & { above: number } };

/** Los tokens de entrada desde los que una llamada de Haiku 5.5 se cobra al precio de prompt largo. */
export const LONG_PROMPT_TOKENS = 100_000;

/**
 * Por el comienzo del id del modelo: la API responde el id con o sin fecha ("claude-haiku-4-5-20251001").
 * Gana el primero que coincide, así que un id que empieza como otro va antes ("claude-sonnet-5-5" antes
 * que "claude-sonnet-5"); una prueba lo exige.
 */
const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, long: { above: LONG_PROMPT_TOKENS, input: 0.5, output: 2.5 } },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-4-5": { input: 5, output: 25 },
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-fable-5": { input: 10, output: 50 },
};

/** Los modelos con precio (para las pruebas). */
export const PRICED_MODELS = Object.keys(PRICES);

/** El precio del modelo, o null si no está en la tabla (el costo se muestra como "—", no se inventa). */
export function priceOf(model: string): Price | null {
  const key = PRICED_MODELS.find((prefix) => model.startsWith(prefix));
  return key ? PRICES[key] : null;
}

/** Tokens de un modelo; `longPrompt`: llamadas de más de LONG_PROMPT_TOKENS tokens de entrada. */
export type ModelUsage = { model: string; longPrompt: boolean; inputTokens: number; outputTokens: number };

/**
 * El costo en dólares de esos tokens, o null si el modelo no tiene precio. Las llamadas de prompt
 * largo usan el precio de prompt largo si el modelo lo tiene.
 */
export function usageCost({ model, longPrompt, inputTokens, outputTokens }: ModelUsage): number | null {
  const price = priceOf(model);
  if (!price) return null;
  const rate = longPrompt && price.long ? price.long : price;
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}

/**
 * El costo total de varios grupos de tokens (de una cuenta o de todo el período), y los modelos que no
 * tienen precio (sus tokens no suman: el total los deja afuera y lo dice).
 */
export function totalCost(usages: readonly ModelUsage[]): { usd: number; unpriced: string[] } {
  let usd = 0;
  const unpriced = new Set<string>();
  for (const usage of usages) {
    const cost = usageCost(usage);
    if (cost === null) unpriced.add(usage.model);
    else usd += cost;
  }
  return { usd, unpriced: [...unpriced].sort() };
}

/** Desde aquí se muestra el monto; menos que esto (pero más de cero) redondearía a US$0,00. */
const SMALLEST_SHOWN = 0.005;

/** El costo para mostrar: "US$0,07", "<US$0,01" si no alcanza un centavo, "—" si no se puede calcular. */
export function formatCost(usd: number | null): string {
  if (usd === null) return "—";
  if (usd > 0 && usd < SMALLEST_SHOWN) return `<${formatMoney(0.01, "USD")}`;
  return formatMoney(usd, "USD");
}
