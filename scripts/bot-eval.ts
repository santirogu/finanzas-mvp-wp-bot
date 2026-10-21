// Evalúa el intérprete del bot contra el set de frases de src/modules/bot/eval/cases.ts.
// Llama a la API de Claude (tiene costo). Uso:
//   pnpm bot:eval                                 → modelo por defecto
//   pnpm bot:eval --model claude-opus-5-5         → comparar otro modelo
//   pnpm bot:eval --effort medium --only zapatos  → filtrar casos por texto
import "dotenv/config";
import { parseArgs } from "node:util";
import { DEFAULT_CATEGORIES } from "../src/modules/transactions/default-categories";
import { botModel, claudeExtractor } from "../src/modules/bot/claude-extractor";
import { EVAL_CASES, EVAL_TODAY, type EvalCase } from "../src/modules/bot/eval/cases";
import { interpretMessage, type BotIntent } from "../src/modules/bot/interpret";

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    effort: { type: "string" },
    only: { type: "string" },
    concurrency: { type: "string", default: "4" },
  },
});
if (args.model) process.env.BOT_MODEL = args.model;
if (args.effort) process.env.BOT_EFFORT = args.effort;

// USD por millón de tokens (entrada, salida). Fuente: precios publicados por Anthropic.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

const categories = {
  expense: DEFAULT_CATEGORIES.expense.map((c) => c.name),
  income: DEFAULT_CATEGORIES.income.map((c) => c.name),
};

// El bot tutea, como toda la app (glosario de textos): estas formas son de usted.
const USTED = /\b(usted|ustedes|escriba|envíe|envíeme|intente|indíqueme|dígame|cuénteme|disculpe|tenga)\b/i;

function grade(c: EvalCase, intent: BotIntent): string[] {
  const problems: string[] = [];
  if (c.expect.kind === "reply") {
    if (intent.kind !== "reply") {
      problems.push(`esperaba una respuesta sin registrar, obtuvo ${intent.kind}`);
      return problems;
    }
    if (c.expect.mentions && !c.expect.mentions.test(intent.text)) problems.push(`la respuesta no dice ${c.expect.mentions}: "${intent.text}"`);
    if (c.expect.noQuestion && intent.text.includes("?")) problems.push(`pregunta en vez de pedir el movimiento completo: "${intent.text}"`);
    if (USTED.test(intent.text)) problems.push(`trata de usted: "${intent.text}"`);
    return problems;
  }
  if (intent.kind !== "transactions") {
    problems.push(`esperaba transacciones, obtuvo ${intent.kind}${"text" in intent ? `: "${intent.text}"` : ""}${"reason" in intent ? `: ${intent.reason}` : ""}`);
    return problems;
  }
  if (intent.items.length !== c.expect.items.length) {
    problems.push(`esperaba ${c.expect.items.length} transacción(es), obtuvo ${intent.items.length}`);
  }
  c.expect.items.forEach((want, i) => {
    const got = intent.items[i];
    if (!got) return;
    if (got.type !== want.type) problems.push(`#${i + 1} tipo ${got.type} ≠ ${want.type}`);
    if (got.amount !== want.amount) problems.push(`#${i + 1} monto ${got.amount} ≠ ${want.amount}`);
    if (want.categories && !want.categories.includes(got.category ?? "")) {
      problems.push(`#${i + 1} categoría ${got.category} ∉ [${want.categories.join(", ")}]`);
    }
    const wantDate = want.date ?? EVAL_TODAY;
    if (got.occurredOn !== wantDate) problems.push(`#${i + 1} fecha ${got.occurredOn} ≠ ${wantDate}`);
  });
  return problems;
}

async function main() {
  const cases = EVAL_CASES.filter((c) => !args.only || c.text.toLowerCase().includes(args.only.toLowerCase()));
  const model = botModel();
  console.log(`Modelo: ${model} · esfuerzo: ${process.env.BOT_EFFORT || "low"} · casos: ${cases.length}\n`);

  const results: { c: EvalCase; problems: string[]; ms: number; intent: BotIntent }[] = [];
  const queue = [...cases];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const start = performance.now();
      const intent = await interpretMessage(c.text, { today: EVAL_TODAY, categories }, claudeExtractor);
      const problems = grade(c, intent);
      const ms = performance.now() - start;
      results.push({ c, problems, ms, intent });
      console.log(`${problems.length ? "✗" : "✓"} ${c.text}${problems.length ? `\n    ${problems.join("\n    ")}` : ""}`);
    }
  };
  await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));

  const passed = results.filter((r) => r.problems.length === 0).length;
  const usageOf = (intent: BotIntent) => ("usage" in intent ? intent.usage : undefined);
  const input = results.reduce((sum, r) => sum + (usageOf(r.intent)?.inputTokens ?? 0), 0);
  const output = results.reduce((sum, r) => sum + (usageOf(r.intent)?.outputTokens ?? 0), 0);
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const price = PRICES[model];
  const cost = price ? (input * price[0] + output * price[1]) / 1_000_000 : null;

  console.log(`\nResultado: ${passed}/${results.length} (${Math.round((passed / Math.max(results.length, 1)) * 100)}%)`);
  console.log(`Latencia: p50 ${(p50 / 1000).toFixed(1)} s · p95 ${(p95 / 1000).toFixed(1)} s`);
  console.log(`Tokens: ${input} entrada · ${output} salida`);
  if (cost !== null) {
    console.log(`Costo de esta corrida: US$${cost.toFixed(4)} · por mensaje: US$${(cost / Math.max(results.length, 1)).toFixed(5)}`);
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
