import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { fixedPaymentSkip, transaction } from "@/db/schema";
import { formatMonthName, monthOf } from "@/lib/dates";
import { searchKey } from "@/lib/suggestions";
import type { ToastTone } from "@/lib/toasts";

// "Este pago ya no aplica" en los avisos de próximos pagos (la tabla fixed_payment_skip): oculta el aviso
// de un gasto fijo solo para ese mes. Reciben el userId ya validado por el Data Access Layer
// (src/lib/session.ts) y siempre filtran por él.

/** Los pagos marcados, como los busca upcomingPayments: "<clave> YYYY-MM". */
export async function getPaymentSkips(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ key: fixedPaymentSkip.descriptionKey, month: fixedPaymentSkip.month })
    .from(fixedPaymentSkip)
    .where(eq(fixedPaymentSkip.userId, userId));
  return new Set(rows.map((row) => `${row.key} ${row.month}`));
}

const input = z.object({
  description: z.string().trim().min(1).max(140),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export type PaymentSkipResult = { ok: true; message: string; tone: ToastTone } | { ok: false; error: string };

/**
 * Marca el pago de un mes de un gasto fijo como "ya no aplica". Solo de un gasto que la persona tiene
 * (algún egreso con esa descripción): así nadie llena la tabla con lo que quiera. Marcarlo dos veces no
 * hace nada.
 */
export async function skipFixedPayment(userId: string, raw: { description: unknown; month: unknown }): Promise<PaymentSkipResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "No se pudo ocultar el aviso." };
  const { description, month } = parsed.data;
  const [expense] = await db
    .select({ id: transaction.id })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "expense"),
        isNull(transaction.deletedAt),
        sql`lower(trim(${transaction.description})) = lower(${description})`,
      ),
    )
    .limit(1);
  if (!expense) return { ok: false, error: "No se pudo ocultar el aviso." };
  await db.insert(fixedPaymentSkip).values({ userId, descriptionKey: searchKey(description), month }).onConflictDoNothing();
  return { ok: true, message: `No se avisará del pago de ${formatMonthName(monthOf(`${month}-01`))} de «${description}»`, tone: "removal" };
}
