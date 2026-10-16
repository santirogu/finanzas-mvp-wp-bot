import "server-only";
import { and, count, desc, eq, ilike, isNotNull, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { user, whatsappMessage } from "@/db/schema";
import { todayInTimezone } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";
import { ADMIN_TIMEZONE, dateRange, escapeLike, searchDigits } from "../shared/filters";
import { inDayRange } from "../shared/sql";
import { OUTCOMES, claudeDays, type BotFilters, type Outcome } from "./bot-filters";

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
/** El día de Colombia de una fecha (para agrupar). La zona va como texto fijo, no como parámetro. */
const day = (column: AnyColumn) =>
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
  when ${notText} then 'no_texto'
  when ${whatsappMessage.userId} is null then 'sin_vincular'
  else 'suspendida'
end`;

/** El filtro de la URL: fechas (de recibido, o de la llamada a Claude) y la cuenta o el número. */
function where(
  filters: BotFilters,
  today: string,
  column: AnyColumn = whatsappMessage.receivedAt,
  range: { from: string | null; to: string | null } = dateRange(filters, today),
): SQL | undefined {
  const conditions: (SQL | undefined)[] = inDayRange(column, range);
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
  total: number;
  outcomes: Record<Outcome, number>;
  /** Tiempo entre que llega el mensaje y se responde, en segundos (null sin mensajes procesados). */
  response: { median: number; p95: number } | null;
  claude: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    byDay: { day: string; calls: number }[];
    byModel: { model: string; calls: number; inputTokens: number; outputTokens: number }[];
  };
  /** Las cuentas que llegaron al tope de Claude, de la que más veces a la que menos (máximo 10). */
  capped: { id: string; name: string; email: string; times: number }[];
  /** Los errores, del más frecuente al menos (máximo 20). */
  errors: { error: string; times: number; last: Date; accounts: number }[];
};

export async function botActivity(filters: BotFilters, today: string): Promise<BotActivity> {
  await requireAdmin();
  const days = claudeDays(filters, today);
  const claudeRange = where(filters, today, whatsappMessage.aiRequestedAt);

  const [outcomeRows, [timing], [claude], byDay, byModel, capped, errors] = await Promise.all([
    db
      .select({ outcome, times: count() })
      .from(whatsappMessage)
      .leftJoin(user, eq(user.id, whatsappMessage.userId))
      .where(where(filters, today))
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
      .where(and(claudeRange, isNotNull(whatsappMessage.aiRequestedAt))),
    db
      .select({ day: day(whatsappMessage.aiRequestedAt), calls: count() })
      .from(whatsappMessage)
      .leftJoin(user, eq(user.id, whatsappMessage.userId))
      .where(
        and(
          where(filters, today, whatsappMessage.aiRequestedAt, { from: days[0], to: days.at(-1)! }),
          isNotNull(whatsappMessage.aiRequestedAt),
        ),
      )
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
        accounts: sql<number>`count(distinct ${whatsappMessage.userId})::int`,
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
    total: outcomeRows.reduce((sum, row) => sum + row.times, 0),
    outcomes,
    response: timing.median === null || timing.p95 === null ? null : { median: Number(timing.median), p95: Number(timing.p95) },
    claude: { ...claude, byDay: days.map((d) => ({ day: d, calls: callsByDay.get(d) ?? 0 })), byModel },
    capped,
    errors: errors.map((row) => ({ ...row, last: new Date(row.last) })),
  };
}

/** El resumen de la tarjeta de Inicio: mensajes y errores de hoy. */
export async function botSummary(today = todayInTimezone(ADMIN_TIMEZONE)): Promise<{ today: number; failedToday: number }> {
  await requireAdmin();
  const [row] = await db
    .select({
      today: count(),
      failedToday: sql<number>`count(*) filter (where ${whatsappMessage.status} = 'failed')::int`,
    })
    .from(whatsappMessage)
    .where(and(...inDayRange(whatsappMessage.receivedAt, { from: today, to: today })));
  return row;
}
