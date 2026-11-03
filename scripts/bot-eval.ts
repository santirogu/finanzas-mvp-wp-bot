// Evalúa el intérprete del bot contra el set de frases de src/modules/bot/eval/cases.ts (con los mensajes trampa).
// Llama a la API de Claude (tiene costo). Uso:
//   pnpm bot:eval                                 → modelo por defecto
//   pnpm bot:eval --model claude-opus-5-5         → comparar otro modelo
//   pnpm bot:eval --effort medium --only zapatos  → filtrar casos por texto ("--only [foto" para las fotos)
//   pnpm bot:eval --min 95                        → falla si cae una trampa o el resto acierta menos del 95 %
// En GitHub Actions (.github/workflows/bot-eval.yml) deja el resumen en la página de la corrida.
import "dotenv/config";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_CATEGORIES } from "../src/modules/transactions/default-categories";
import { botModel, claudeExtractor } from "../src/modules/bot/claude-extractor";
import { EVAL_CASES, EVAL_TODAY, type EvalCase } from "../src/modules/bot/eval/cases";
import { caseLabel, evalOutcome, grade, summaryMarkdown } from "../src/modules/bot/eval/grade";
import { interpretMessage, interpretPhoto, type BotIntent } from "../src/modules/bot/interpret";
import { photoMediaType } from "../src/modules/bot/photo";

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    effort: { type: "string" },
    only: { type: "string" },
    concurrency: { type: "string", default: "4" },
    min: { type: "string", default: "100" },
  },
});
const minShare = Number(args.min);
if (!Number.isFinite(minShare) || minShare < 0 || minShare > 100) {
  console.error("--min va de 0 a 100 (el porcentaje mínimo de aciertos sin contar las trampas).");
  process.exit(2);
}
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

/** Un caso como le llega al bot: el texto o la foto (de src/modules/bot/eval/fotos/) con su texto. */
function interpretCase(c: EvalCase): Promise<BotIntent> {
  // El idioma de la cuenta del caso (sin decir, español): el de la descripción y la respuesta.
  const ctx = { today: EVAL_TODAY, categories, locale: c.locale ?? "es" };
  if (!c.photo) return interpretMessage(c.text, ctx, claudeExtractor);
  const file = readFileSync(join(process.cwd(), "src/modules/bot/eval/fotos", c.photo));
  const mediaType = photoMediaType(file);
  if (!mediaType) throw new Error(`${c.photo} no es una imagen JPEG, PNG o WebP`);
  return interpretPhoto({ image: { data: file.toString("base64"), mediaType }, caption: c.text || null }, ctx, claudeExtractor);
}

async function main() {
  const cases = EVAL_CASES.filter((c) => !args.only || caseLabel(c).toLowerCase().includes(args.only.toLowerCase()));
  const model = botModel();
  console.log(`Modelo: ${model} · esfuerzo: ${process.env.BOT_EFFORT || "low"} · casos: ${cases.length}\n`);

  const results: { c: EvalCase; problems: string[]; ms: number; intent: BotIntent }[] = [];
  const queue = [...cases];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const start = performance.now();
      const intent = await interpretCase(c);
      const problems = grade(c, intent);
      const ms = performance.now() - start;
      results.push({ c, problems, ms, intent });
      console.log(`${problems.length ? "✗" : "✓"} ${caseLabel(c)}${problems.length ? `\n    ${problems.join("\n    ")}` : ""}`);
    }
  };
  await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));

  const outcome = evalOutcome(results, minShare);
  const usageOf = (intent: BotIntent) => ("usage" in intent ? intent.usage : undefined);
  const input = results.reduce((sum, r) => sum + (usageOf(r.intent)?.inputTokens ?? 0), 0);
  const output = results.reduce((sum, r) => sum + (usageOf(r.intent)?.outputTokens ?? 0), 0);
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const price = PRICES[model];
  const cost = price ? (input * price[0] + output * price[1]) / 1_000_000 : null;

  const latency = `p50 ${(p50 / 1000).toFixed(1)} s · p95 ${(p95 / 1000).toFixed(1)} s`;
  const costText = cost === null ? null : `US$${cost.toFixed(4)} · por mensaje: US$${(cost / Math.max(results.length, 1)).toFixed(5)}`;
  console.log(`\nResultado: ${outcome.passed}/${outcome.total} (${Math.round((outcome.passed / Math.max(outcome.total, 1)) * 100)}%)`);
  console.log(`Sin las trampas: ${Math.floor(outcome.regularShare)} % (mínimo ${minShare} %) · trampas que cayeron: ${outcome.trapsFailed.length}`);
  console.log(`Latencia: ${latency}`);
  console.log(`Tokens: ${input} entrada · ${output} salida`);
  if (costText) console.log(`Costo de esta corrida: ${costText}`);
  // En GitHub Actions, el resumen va a la página de la corrida.
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) appendFileSync(summaryFile, summaryMarkdown(outcome, results, { model, minShare, latency, cost: costText }));
  process.exit(outcome.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
