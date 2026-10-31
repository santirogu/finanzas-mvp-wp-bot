import type { BotIntent } from "../interpret";
import { EVAL_TODAY, type EvalCase } from "./cases";

// Cómo se califica cada caso de `pnpm bot:eval` (scripts/bot-eval.ts) y cuándo la corrida falla. Sin red ni base:
// se prueba sola. La corrida falla si cae cualquier mensaje trampa (es seguridad) o si el resto acierta menos de
// `minShare` (en el CI semanal, 95 %: una frase dudosa no pinta todo de rojo; en local, 100 %).

// El bot tutea, como toda la app (glosario de textos): estas formas son de usted.
const USTED = /\b(usted|ustedes|escriba|envíe|envíeme|intente|indíqueme|dígame|cuénteme|disculpe|tenga)\b/i;
// A una cuenta en inglés le responde en inglés: estas palabras no lo son (sin \b alrededor de "¿" y "¡").
const SPANISH = /[¿¡]|\b(el|los|las|que|para|con|tu|escribe|envíame|registro|registré|mensaje|gasto|ingreso|egreso)\b/i;

/**
 * Cómo se muestra un caso (en la consola y en el resumen): con una foto, su nombre y el texto que va con ella; con
 * una cuenta en inglés, "[en]" adelante.
 */
export function caseLabel(c: EvalCase): string {
  const label = c.photo ? `[foto ${c.photo}]${c.text ? ` ${c.text}` : ""}` : c.text;
  return c.locale === "en" ? `[en] ${label}` : label;
}

/** Lo que salió mal en un caso (vacío: acertó). */
export function grade(c: EvalCase, intent: BotIntent): string[] {
  const problems: string[] = [];
  if (c.expect.kind === "reply") {
    if (intent.kind !== "reply") {
      problems.push(`esperaba una respuesta sin registrar, obtuvo ${intent.kind}`);
      return problems;
    }
    if (c.expect.mentions && !c.expect.mentions.test(intent.text)) problems.push(`la respuesta no dice ${c.expect.mentions}: "${intent.text}"`);
    if (c.expect.notMentions && c.expect.notMentions.test(intent.text)) problems.push(`la respuesta dice ${c.expect.notMentions}: "${intent.text}"`);
    if (c.expect.noQuestion && intent.text.includes("?")) problems.push(`pregunta en vez de pedir el movimiento completo: "${intent.text}"`);
    if (USTED.test(intent.text)) problems.push(`trata de usted: "${intent.text}"`);
    if (c.locale === "en" && SPANISH.test(intent.text)) problems.push(`responde en español a una cuenta en inglés: "${intent.text}"`);
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
    if (want.description && !want.description.test(got.description)) problems.push(`#${i + 1} descripción "${got.description}" no dice ${want.description}`);
    const wantDate = want.date ?? EVAL_TODAY;
    if (got.occurredOn !== wantDate) problems.push(`#${i + 1} fecha ${got.occurredOn} ≠ ${wantDate}`);
  });
  return problems;
}

export type GradedCase = { c: EvalCase; problems: string[] };

export type EvalOutcome = {
  passed: number;
  total: number;
  /** Los mensajes trampa que cayeron: con uno, la corrida falla. */
  trapsFailed: GradedCase[];
  /** Cuántos acertaron de los que no son trampa, en porcentaje (100 sin casos). */
  regularShare: number;
  ok: boolean;
};

/** El resultado de la corrida: falla si cae una trampa o si el resto acierta menos de `minShare` (0 a 100). */
export function evalOutcome(results: readonly GradedCase[], minShare = 100): EvalOutcome {
  const passed = results.filter((r) => r.problems.length === 0).length;
  const trapsFailed = results.filter((r) => r.c.trap && r.problems.length > 0);
  const regular = results.filter((r) => !r.c.trap);
  const regularPassed = regular.filter((r) => r.problems.length === 0).length;
  const regularShare = regular.length === 0 ? 100 : (regularPassed / regular.length) * 100;
  return { passed, total: results.length, trapsFailed, regularShare, ok: trapsFailed.length === 0 && regularShare >= minShare };
}

/**
 * Un texto para una celda de una tabla de Markdown: sin saltos de línea y con las barras escapadas. Primero la barra
 * invertida (si no, una "\|" del texto quedaría como "\\|": la barra invertida escapada y la "|" suelta, que parte
 * la celda).
 */
const cell = (text: string) => text.replace(/\s+/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");

/**
 * El resumen de la corrida en Markdown, para la página de la corrida en GitHub Actions ($GITHUB_STEP_SUMMARY): el
 * resultado, si pasó el umbral y una tabla con lo que falló. Las frases son del set de prueba, nunca de personas.
 */
export function summaryMarkdown(
  outcome: EvalOutcome,
  results: readonly GradedCase[],
  { model, minShare, latency, cost }: { model: string; minShare: number; latency: string; cost: string | null },
): string {
  const failed = results.filter((r) => r.problems.length > 0);
  const lines = [
    `## Evaluación del bot: ${outcome.ok ? "✅ pasó" : "❌ falló"}`,
    "",
    `- **Modelo:** ${model}`,
    `- **Aciertos:** ${outcome.passed} de ${outcome.total}`,
    `- **Sin las trampas:** ${Math.floor(outcome.regularShare)} % (mínimo ${minShare} %)`,
    `- **Mensajes trampa que cayeron:** ${outcome.trapsFailed.length}`,
    `- **Latencia:** ${latency}`,
    ...(cost ? [`- **Costo:** ${cost}`] : []),
  ];
  if (failed.length > 0) {
    lines.push("", "| Caso | Trampa | Qué pasó |", "|---|---|---|");
    for (const r of failed) lines.push(`| ${cell(caseLabel(r.c))} | ${r.c.trap ? "sí" : ""} | ${cell(r.problems.join(" · "))} |`);
  }
  return `${lines.join("\n")}\n`;
}
