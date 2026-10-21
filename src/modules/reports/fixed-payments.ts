import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { category, transaction } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { formatMoney } from "@/lib/money";
import { searchKey } from "@/lib/suggestions";
import type { ToastTone } from "@/lib/toasts";
import { categoryNameIn } from "@/modules/transactions/category-name";
import { isCategoryAvailable } from "@/modules/transactions/queries";
import { transactionSchema } from "@/modules/transactions/validation";

// "Registrar pago" en los avisos de próximos pagos del Resumen: registra el pago de un gasto fijo como un
// egreso más, con la descripción y la categoría del último pago (las busca el servidor, nunca las da el
// navegador) y el monto y la fecha que confirma la persona. Reciben el userId ya validado por el Data
// Access Layer (src/lib/session.ts) y siempre filtran por él.

/** Cuántos egresos recientes se miran para encontrar el último pago de cada gasto. */
const RECENT_EXPENSES = 1000;

export type LastPayment = {
  description: string;
  categoryId: string | null;
  /** "🩺 Salud" o, sin categoría, null: para la ventana (que lo dice en su idioma). */
  category: string | null;
};

/**
 * El último pago de cada gasto (por su clave, `searchKey` de la descripción), entre los egresos recientes,
 * con el nombre de su categoría en el idioma de la página.
 */
export async function getLastPayments(userId: string, locale: Locale = DEFAULT_LOCALE): Promise<Map<string, LastPayment>> {
  const rows = await db
    .select({
      description: transaction.description,
      categoryId: transaction.categoryId,
      name: categoryNameIn(locale),
      emoji: category.emoji,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(eq(transaction.userId, userId), eq(transaction.type, "expense"), isNull(transaction.deletedAt)))
    .orderBy(desc(transaction.occurredOn), desc(transaction.createdAt))
    .limit(RECENT_EXPENSES);
  const last = new Map<string, LastPayment>();
  for (const row of rows) {
    const key = searchKey(row.description);
    if (last.has(key)) continue;
    last.set(key, {
      description: row.description,
      categoryId: row.categoryId,
      category: row.name ? `${row.emoji} ${row.name}` : null,
    });
  }
  return last;
}

const TEXTS = texts(
  {
    notFound: "No encontramos ese gasto entre tus egresos.",
    future: "La fecha no puede ser después de hoy.",
    registered: (description: string, amount: string) => `Se registró el pago de “${description}”: −${amount}`,
  },
  {
    en: {
      notFound: "We couldn't find that expense among yours.",
      future: "The date can't be after today.",
      registered: (description, amount) => `The payment of “${description}” was added: −${amount}`,
    },
  },
);

export type RegisterPaymentResult =
  | { ok: true; message: string; tone: ToastTone }
  | { ok: false; error: string; field?: "amount" | "occurredOn" };

/**
 * Registra el pago de un gasto fijo (`description`, como lo muestra el aviso) con el monto y la fecha que
 * confirmó la persona. `today` (YYYY-MM-DD, en su zona): la fecha no puede ser después. Si la categoría del
 * último pago ya no se puede elegir (el admin la archivó), va sin categoría. El monto se lee y los mensajes
 * salen en el idioma de la página (`locale`).
 */
export async function registerFixedPayment(
  user: { id: string; currency: string },
  raw: { description: unknown; amount: unknown; occurredOn: unknown },
  today: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<RegisterPaymentResult> {
  const t = TEXTS[locale];
  const last = typeof raw.description === "string" ? (await getLastPayments(user.id, locale)).get(searchKey(raw.description)) : undefined;
  if (!last) return { ok: false, error: t.notFound };
  const parsed = transactionSchema(locale).safeParse({
    type: "expense",
    amount: String(raw.amount ?? ""),
    description: last.description,
    categoryId: "",
    occurredOn: String(raw.occurredOn ?? ""),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: issue.path[0] === "amount" ? "amount" : "occurredOn" };
  }
  const { amount, occurredOn } = parsed.data;
  if (occurredOn > today) return { ok: false, error: t.future, field: "occurredOn" };
  const categoryId = last.categoryId && (await isCategoryAvailable(user.id, last.categoryId, "expense")) ? last.categoryId : null;
  await db.insert(transaction).values({
    userId: user.id,
    type: "expense",
    amount,
    currency: user.currency,
    description: last.description,
    categoryId,
    occurredOn,
    source: "web",
  });
  return { ok: true, message: t.registered(last.description, formatMoney(amount, user.currency, locale)), tone: "success" };
}
