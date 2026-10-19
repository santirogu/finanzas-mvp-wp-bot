import "server-only";
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { user, whatsappMessage } from "@/db/schema";
import { todayInTimezone } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";
import { monthlyBudgetReached } from "@/modules/bot/limits";
import { LONG_PROMPT_TOKENS, totalCost, type ModelUsage } from "@/modules/bot/pricing";
import { getBotSettings } from "@/modules/bot/settings";
import { tokensUsedThisMonth } from "@/modules/bot/token-budget";
import { ADMIN_TIMEZONE, dateRange, escapeLike, searchDigits } from "../shared/filters";
import { inDayRange } from "../shared/sql";
import { OUTCOMES, claudeDays, type AccountSort, type BotFilters, type Outcome } from "./bot-filters";

// El funcionamiento del bot (/admin/bot), de todas las cuentas. Cada consulta valida el rol ella misma
// (requireAdmin), además de la página que la usa: la matriz de autorización lo exige.
//
// Privacidad: la política promete que el admin no ve los mensajes. Estas consultas nunca devuelven el
// texto (body), la respuesta del bot (reply) ni lo que entendió Claude (los movimientos de intent):
// solo el tipo de intención, el motivo de un error y los tokens que usó Claude. Del texto solo se mira,
// sin devolverlo, si es la marca de un mensaje que no era texto ("[audio]"); src/modules/admin/bot/
// bot-activity.int.test.ts lo comprueba.

const kind = sql`${whatsappMessage.intent}->>'kind'`;
const reason = sql`${whatsappMessage.intent}->>'reason'`;
/** Lo que pone el webhook en vez del texto cuando el mensaje es un audio, una foto, etc. */
const notText = sql`${whatsappMessage.body} ~ '^\\[[a-z_]+\\]$'`;
const usage = (field: "inputTokens" | "outputTokens") =>
  sql<number>`coalesce(sum((${whatsappMessage.intent}->'usage'->>${sql.raw(`'${field}'`)})::int), 0)::int`;
/** El modelo que respondió (lo guarda el bot con los tokens). */
const usageModel = sql<string>`${whatsappMessage.intent}->'usage'->>'model'`;
/** Una llamada de prompt largo: Haiku 5.5 la cobra a otro precio (src/modules/bot/pricing.ts). */
const longPrompt = sql<boolean>`coalesce((${whatsappMessage.intent}->'usage'->>'inputTokens')::int, 0) > ${LONG_PROMPT_TOKENS}`;
/** Los tokens agrupados por modelo y por largo del prompt: con eso se calcula el costo en dólares. */
const usageColumns = {
  model: usageModel,
  longPrompt,
  inputTokens: usage("inputTokens"),
  outputTokens: usage("outputTokens"),
};
/**
 * Una llamada a Claude: el bot reservó el cupo (ai_requested_at, que existe desde el 15 de octubre de
 * 2026, #55) o guardó los tokens que usó. Los mensajes de antes tienen los tokens pero no la reserva, y
 * una llamada que falló antes de responder tiene la reserva pero no los tokens.
 */
const claudeCall = sql`(${whatsappMessage.aiRequestedAt} is not null or ${whatsappMessage.intent}->'usage' is not null)`;
/** Cuándo se llamó a Claude: la reserva del cupo o, en los mensajes de antes, la llegada del mensaje. */
const claudeAt = sql`coalesce(${whatsappMessage.aiRequestedAt}, ${whatsappMessage.receivedAt})`;
/** El día de Colombia de una fecha (para agrupar). La zona va como texto fijo, no como parámetro. */
const day = (column: AnyColumn | SQL) =>
  sql<string>`to_char(${column} at time zone ${sql.raw(`'${ADMIN_TIMEZONE}'`)}, 'YYYY-MM-DD')`;

/** El resultado de cada mensaje (src/modules/admin/bot/bot-filters.ts → OUTCOMES). */
const outcome = sql<Outcome>`case
  when ${whatsappMessage.status} = 'received' then 'pendiente'
  when ${whatsappMessage.status} = 'failed' then 'error'
  when ${whatsappMessage.status} = 'link_failed' then 'vinculacion_fallida'
  when ${kind} = 'transactions' then 'registrado'
  when ${kind} = 'command' then 'comando'
  when ${kind} = 'reply' then 'respuesta'
  when ${kind} = 'link' then 'vinculado'
  when ${kind} = 'error' and ${reason} = 'rate_limited' then 'tope_claude'
  when ${kind} = 'error' and ${reason} = 'monthly_limit' then 'tope_mensual'
  when ${kind} = 'error' and ${reason} = 'paused' then 'pausa'
  when ${notText} then 'no_texto'
  when ${whatsappMessage.userId} is null then 'sin_vincular'
  else 'suspendida'
end`;

/** El filtro de la URL: fechas (de recibido, o de la llamada a Claude), la cuenta o el número, y el resultado. */
function where(
  filters: BotFilters,
  today: string,
  column: AnyColumn | SQL = whatsappMessage.receivedAt,
  range: { from: string | null; to: string | null } = dateRange(filters, today),
): SQL | undefined {
  const conditions: (SQL | undefined)[] = inDayRange(column, range);
  // Al tocar una barra: solo los mensajes con ese resultado (va como parámetro).
  if (filters.outcome) conditions.push(sql`${outcome} = ${filters.outcome}`);
  if (filters.search) {
    const text = `%${escapeLike(filters.search)}%`;
    const digits = searchDigits(filters.search);
    conditions.push(
      or(
        ilike(user.name, text),
        ilike(user.email, text),
        ilike(whatsappMessage.phone, text),
        // "+57 300 111" encuentra 573001112233.
        digits ? ilike(whatsappMessage.phone, `%${digits}%`) : undefined,
      ),
    );
  }
  return and(...conditions);
}

export type BotActivity = {
  /** Los mensajes con los filtros (también el resultado, si se tocó una barra). */
  total: number;
  /** Cuántos hubo de cada resultado, sin el filtro de resultado: las barras siguen mostrando todos. */
  outcomes: Record<Outcome, number>;
  /** Tiempo entre que llega el mensaje y se responde, en segundos (null sin mensajes procesados). */
  response: { median: number; p95: number } | null;
  claude: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    byDay: { day: string; calls: number }[];
    byModel: { model: string; calls: number; inputTokens: number; outputTokens: number }[];
    /**
     * El costo estimado en dólares (src/modules/bot/pricing.ts) y los modelos sin precio, cuyos tokens
     * no suman.
     */
    cost: { usd: number; unpriced: string[] };
  };
  /** Las cuentas que llegaron al tope de Claude, de la que más veces a la que menos (máximo 10). */
  capped: { id: string; name: string; email: string; times: number }[];
  /**
   * Los errores, del más frecuente al menos (máximo 20), con cuántos números los tuvieron: si el bot
   * falla antes de identificar la cuenta, el mensaje queda sin cuenta, pero siempre tiene número.
   */
  errors: { error: string; times: number; last: Date; numbers: number }[];
};

export async function botActivity(filters: BotFilters, today: string): Promise<BotActivity> {
  await requireAdmin();
  const days = claudeDays(filters, today);
  const claudeRange = where(filters, today, claudeAt);

  const [outcomeRows, [timing], [claude], byDay, byModel, costRows, capped, errors] = await Promise.all([
    db
      .select({ outcome, times: count() })
      .from(whatsappMessage)
      .leftJoin(user, eq(user.id, whatsappMessage.userId))
      .where(where({ ...filters, outcome: null }, today))
      .groupBy(sql`1`),
    db
      .select({
        median: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from ${whatsappMessage.processedAt} - ${whatsappMessage.receivedAt}))`,
        p95: sql<number | null>`percentile_cont(0.95) within group (order by extract(epoch from ${whatsappMessage.processedAt} - ${whatsappMessage.receivedAt}))`,
      })
      .from(whatsappMessage)
      .leftJoin(user, eq(user.id, whatsappMessage.userId))
      .where(and(where(filters, today), isNotNull(whatsappMessage.processedAt))),
    db
      .select({ calls: count(), inputTokens: usage("inputTokens"), outputTokens: usage("outputTokens") })
      .from(whatsappMessage)
      .leftJoin(user, eq(user.id, whatsappMessage.userId))
      .where(and(claudeRange, claudeCall)),
    db
      .select({ day: day(claudeAt), calls: count() })
      .from(whatsappMessage)
      .leftJoin(user, eq(user.id, whatsappMessage.userId))
      .where(and(where(filters, today, claudeAt, { from: days[0], to: days.at(-1)! }), claudeCall))
      .groupBy(sql`1`),
    db
      .select({
        model: sql<string>`${whatsappMessage.intent}->'usage'->>'model'`,
        calls: count(),
        inputTokens: usage("inputTokens"),
        outputTokens: usage("outputTokens"),
      })
      .from(whatsappMessage)
      .leftJoin(user, eq(user.id, whatsappMessage.userId))
      .where(and(claudeRange, sql`${whatsappMessage.intent}->'usage'->>'model' is not null`))
      .groupBy(sql`1`)
      .orderBy(desc(count())),
    db
      .select(usageColumns)
      .from(whatsappMessage)
      .leftJoin(user, eq(user.id, whatsappMessage.userId))
      .where(and(claudeRange, sql`${usageModel} is not null`))
      .groupBy(sql`1`, sql`2`),
    db
      .select({ id: user.id, name: user.name, email: user.email, times: count() })
      .from(whatsappMessage)
      .innerJoin(user, eq(user.id, whatsappMessage.userId))
      .where(and(where(filters, today), sql`${kind} = 'error'`, sql`${reason} = 'rate_limited'`))
      .groupBy(user.id, user.name, user.email)
      .orderBy(desc(count()), user.name)
      .limit(10),
    db
      .select({
        error: sql<string>`coalesce(${whatsappMessage.error}, '')`,
        times: count(),
        last: sql<Date>`max(${whatsappMessage.receivedAt})`,
        numbers: sql<number>`count(distinct ${whatsappMessage.phone})::int`,
      })
      .from(whatsappMessage)
      .leftJoin(user, eq(user.id, whatsappMessage.userId))
      .where(and(where(filters, today), eq(whatsappMessage.status, "failed")))
      .groupBy(sql`1`)
      .orderBy(desc(count()))
      .limit(20),
  ]);

  const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
  for (const row of outcomeRows) outcomes[row.outcome] = row.times;
  const callsByDay = new Map(byDay.map((row) => [row.day, row.calls]));

  return {
    total: filters.outcome ? outcomes[filters.outcome] : outcomeRows.reduce((sum, row) => sum + row.times, 0),
    outcomes,
    response: timing.median === null || timing.p95 === null ? null : { median: Number(timing.median), p95: Number(timing.p95) },
    claude: {
      ...claude,
      byDay: days.map((d) => ({ day: d, calls: callsByDay.get(d) ?? 0 })),
      byModel,
      cost: totalCost(costRows),
    },
    capped,
    errors: errors.map((row) => ({ ...row, last: new Date(row.last) })),
  };
}

/** Una fila de "Por cuenta"; sin cuenta (id null), los números que escribieron sin estar vinculados. */
export type AccountRow = {
  id: string | null;
  name: string | null;
  email: string | null;
  /** Cuántos números distintos (sirve para la fila de los que no tienen cuenta). */
  phones: number;
  messages: number;
  registered: number;
  tokens: number;
  /** El costo estimado de Claude en dólares; null si alguno de sus mensajes es de un modelo sin precio. */
  cost: number | null;
  errors: number;
  last: Date;
};

const tokensSum = sql<number>`coalesce(sum(
  coalesce((${whatsappMessage.intent}->'usage'->>'inputTokens')::int, 0) +
  coalesce((${whatsappMessage.intent}->'usage'->>'outputTokens')::int, 0)
), 0)::int`;
const errorsCount = sql<number>`count(*) filter (where ${whatsappMessage.status} = 'failed')::int`;
const lastReceived = sql<Date>`max(${whatsappMessage.receivedAt})`;
const SORT_BY: Record<AccountSort, SQL> = {
  tokens: sql`${tokensSum} desc`,
  mensajes: sql`count(*) desc`,
  errores: sql`${errorsCount} desc`,
  ultimo: sql`${lastReceived} desc`,
};

/**
 * "Por cuenta": por cada cuenta, cuántos mensajes, cuántos registraron movimientos, sus tokens de
 * Claude, sus errores y su último mensaje, con los filtros de la página. Solo cantidades, nunca el
 * texto. Los números sin cuenta van juntos al final. Devuelve `limit` filas y si hay más.
 */
export async function botAccounts(filters: BotFilters, today: string): Promise<{ rows: AccountRow[]; hasMore: boolean }> {
  await requireAdmin();
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phones: sql<number>`count(distinct ${whatsappMessage.phone})::int`,
      messages: count(),
      registered: sql<number>`count(*) filter (where ${outcome} = 'registrado')::int`,
      tokens: tokensSum,
      errors: errorsCount,
      last: lastReceived,
    })
    .from(whatsappMessage)
    .leftJoin(user, eq(user.id, whatsappMessage.userId))
    .where(where(filters, today))
    .groupBy(user.id, user.name, user.email)
    .orderBy(sql`${user.id} is null`, SORT_BY[filters.sort], user.name)
    .limit(filters.limit + 1);
  const page = rows.slice(0, filters.limit);

  // El costo de las cuentas de la página: sus tokens por modelo y por largo del prompt, con los mismos
  // filtros (los números sin cuenta van juntos, como en la fila).
  const ids = page.flatMap((row) => (row.id ? [row.id] : []));
  const withoutAccount = page.some((row) => row.id === null);
  const costRows =
    page.length === 0
      ? []
      : await db
          .select({ userId: whatsappMessage.userId, ...usageColumns })
          .from(whatsappMessage)
          .leftJoin(user, eq(user.id, whatsappMessage.userId))
          .where(
            and(
              where(filters, today),
              sql`${usageModel} is not null`,
              or(ids.length > 0 ? inArray(whatsappMessage.userId, ids) : undefined, withoutAccount ? isNull(whatsappMessage.userId) : undefined),
            ),
          )
          .groupBy(sql`1`, sql`2`, sql`3`);
  const usagesOf = new Map<string | null, ModelUsage[]>();
  for (const { userId, ...usage } of costRows) usagesOf.set(userId, [...(usagesOf.get(userId) ?? []), usage]);
  const costOf = (id: string | null) => {
    const { usd, unpriced } = totalCost(usagesOf.get(id) ?? []);
    return unpriced.length > 0 ? null : usd;
  };

  return {
    rows: page.map((row) => ({ ...row, cost: costOf(row.id), last: new Date(row.last) })),
    hasMore: rows.length > filters.limit,
  };
}

/** El resumen de la tarjeta de Inicio: mensajes y errores de hoy, y si Claude está en pausa (o en el tope mensual). */
export async function botSummary(
  today = todayInTimezone(ADMIN_TIMEZONE),
): Promise<{ today: number; failedToday: number; claudePaused: boolean; monthlyLimitReached: boolean }> {
  await requireAdmin();
  const [[row], settings, used] = await Promise.all([
    db
      .select({
        today: count(),
        failedToday: sql<number>`count(*) filter (where ${whatsappMessage.status} = 'failed')::int`,
      })
      .from(whatsappMessage)
      .where(and(...inDayRange(whatsappMessage.receivedAt, { from: today, to: today }))),
    getBotSettings(),
    tokensUsedThisMonth(),
  ]);
  return { ...row, claudePaused: settings.claudePaused, monthlyLimitReached: monthlyBudgetReached(settings.monthlyTokenLimit, used) };
}
