import "server-only";
import type { TransactionType } from "@/db/schema";
import { monthOf, sameDayIn, shiftMonth } from "@/lib/dates";
import { listDescriptionSuggestions } from "@/modules/transactions/queries";
import { matchHistory } from "./history-match";
import type { ParsedTransaction } from "./normalize";

/** Hasta dónde se busca en el historial: un año, así entran los pagos de una vez al año (SOAT, matrícula). */
export const HISTORY_MONTHS = 12;

type CategoryRef = { id: string; name: string };

/**
 * Los movimientos que interpretó el bot, con la descripción que la persona ya usó en su historial
 * (src/modules/bot/history-match.ts) y la categoría de la última vez, si sigue disponible; si no, la que
 * eligió Claude. Solo su propio historial, del mismo tipo, sin lo eliminado y de los últimos 12 meses.
 */
export async function withHistoryDescriptions(
  userId: string,
  items: readonly ParsedTransaction[],
  categories: Record<TransactionType, readonly CategoryRef[]>,
  today: string,
): Promise<ParsedTransaction[]> {
  const since = sameDayIn(shiftMonth(monthOf(today), -HISTORY_MONTHS), today);
  const types = [...new Set(items.map((item) => item.type))];
  const history = new Map(await Promise.all(types.map(async (type) => [type, await listDescriptionSuggestions(userId, type, since)] as const)));
  return items.map((item) => {
    const match = matchHistory(item.description, history.get(item.type) ?? []);
    if (!match) return item;
    const category = categories[item.type].find((c) => c.id === match.categoryId)?.name ?? item.category;
    return { ...item, description: match.description, category };
  });
}
