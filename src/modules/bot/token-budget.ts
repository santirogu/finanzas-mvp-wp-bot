import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { currentMonthRange } from "@/lib/dates";
import { TOKEN_BUDGET_TIMEZONE } from "./limits";

// Cuántos tokens de Claude se usaron este mes, de todas las cuentas: los que guarda el bot en cada
// mensaje (intent.usage). Lo usa el tope mensual de /admin/bot: el bot lo revisa antes de cada llamada
// y el admin lo ve en Configuración. Es un tope suave: mensajes simultáneos pueden pasarse un poco.

/** El día en que empieza el mes en curso y el siguiente (YYYY-MM-DD), en hora de Colombia. */
export const currentBudgetMonth = (now = new Date()) => currentMonthRange(TOKEN_BUDGET_TIMEZONE, now);

export async function tokensUsedThisMonth(now = new Date()): Promise<number> {
  const { start, end } = currentBudgetMonth(now);
  const tz = sql.raw(`'${TOKEN_BUDGET_TIMEZONE}'`);
  // Fechada con la llamada o, en los mensajes de antes de la reserva del cupo, con la llegada.
  const at = sql`coalesce(${whatsappMessage.aiRequestedAt}, ${whatsappMessage.receivedAt})`;
  const [row] = await db
    .select({
      used: sql<number>`coalesce(sum(
        coalesce((${whatsappMessage.intent}->'usage'->>'inputTokens')::bigint, 0) +
        coalesce((${whatsappMessage.intent}->'usage'->>'outputTokens')::bigint, 0)
      ), 0)`.mapWith(Number),
    })
    .from(whatsappMessage)
    .where(
      sql`${whatsappMessage.intent}->'usage' is not null
        and ${at} >= (${start}::date)::timestamp at time zone ${tz}
        and ${at} < (${end}::date)::timestamp at time zone ${tz}`,
    );
  return row.used;
}
