"use server";

import { and, eq, gte, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { transaction } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import { getRequestLocale } from "@/i18n/request";
import { texts } from "@/i18n/texts";
import { currentMonthRange, monthOf } from "@/lib/dates";
import { monthHref } from "@/lib/month-nav";
import { TOAST_PARAM } from "@/lib/toasts";
import { requireUser } from "@/lib/session";
import { getBudgetCrossings } from "@/modules/budgets/budgets";
import { budgetAlert } from "@/modules/budgets/progress";
import type { ToastTone } from "@/lib/toasts";
import { addGmf, getGmfEnabled, saveGmfEnabled, syncGmf } from "./gmf";
import { isCategoryAvailable, undoableSince } from "./queries";
import { transactionSchema } from "./validation";

// Los mensajes, en el idioma de quien usa la página (la cookie: src/i18n/server.ts).
const TEXTS = texts(
  {
    invalidCategory: "Esa categoría ya no está disponible. Elige otra.",
    notFound: "No encontramos ese movimiento.",
    income: "Ingreso registrado",
    expense: "Egreso registrado",
    expenseWithGmf: "Egreso y 4x1000 registrados",
    gmfOn: "Listo: al registrar un egreso te ofrecemos el 4x1000, y el bot te lo pregunta.",
    gmfOff: "Apagaste el 4x1000: ya no te lo ofrecemos ni te lo preguntamos.",
  },
  {
    en: {
      invalidCategory: "That category isn't available anymore. Choose another one.",
      notFound: "We couldn't find that transaction.",
      income: "Income added",
      expense: "Expense added",
      expenseWithGmf: "Expense and 4x1000 added",
      gmfOn: "Done: when you add an expense we offer the 4x1000, and the bot asks you about it.",
      gmfOff: "You turned off the 4x1000: we won't offer it or ask you about it anymore.",
    },
  },
);

export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"amount" | "description" | "categoryId" | "occurredOn", string>>;
  // React reinicia el formulario tras cada envío; devolvemos lo escrito para no perderlo si hay error.
  values?: Record<string, string>;
  /** La fecha del movimiento registrado: si cae en otro mes que el de la lista, el aviso dice en cuál. */
  occurredOn?: string;
  /** Los presupuestos que el egreso registrado hizo llegar al 80 % o pasar (src/modules/budgets/). */
  budgetAlerts?: { level: "near" | "over"; text: string }[];
};

export async function createTransactionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Cada Server Action re-valida la sesión: nunca se confía en el cliente.
  const user = await requireUser();
  const locale = await getRequestLocale();
  const t = TEXTS[locale];

  const { values, input, fieldErrors } = readForm(formData, locale);
  if (!input) return { ok: false, fieldErrors, values };
  if (input.categoryId && !(await isCategoryAvailable(user.id, input.categoryId, input.type))) {
    return { ok: false, fieldErrors: { categoryId: t.invalidCategory }, values };
  }

  // "Aplicar 4x1000": solo en un egreso y si la persona lo tiene prendido en Configuración (el servidor lo revisa).
  const withGmf = input.type === "expense" && formData.get("gmf") === "on" && (await getGmfEnabled(user.id));
  const saved = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(transaction)
      .values({
        userId: user.id,
        type: input.type,
        amount: input.amount,
        description: input.description,
        categoryId: input.categoryId ?? null,
        occurredOn: input.occurredOn,
        source: "web",
      })
      .returning({ id: transaction.id });
    const gmf = withGmf
      ? await addGmf([{ id: created.id, userId: user.id, ...input, source: "web", externalId: null }], tx)
      : [];
    return [
      { type: input.type, categoryId: input.categoryId ?? null, amount: input.amount, occurredOn: input.occurredOn },
      ...gmf.map((row) => ({ type: "expense" as const, categoryId: row.categoryId, amount: row.amount, occurredOn: row.occurredOn })),
    ];
  });

  // Si el egreso (o su 4x1000) hizo llegar una categoría al 80 % de su presupuesto o pasarse (solo los de este mes).
  const crossings = await getBudgetCrossings(user.id, currentMonthRange(user.timezone), saved, locale);
  refresh();
  return {
    ok: true,
    message: input.type === "income" ? t.income : saved.length > 1 ? t.expenseWithGmf : t.expense,
    occurredOn: input.occurredOn,
    ...(crossings.length > 0 && {
      budgetAlerts: crossings.map((crossing) => ({ level: crossing.level, text: budgetAlert(crossing, locale) })),
    }),
  };
}

/** Lee y valida los campos comunes del formulario de movimientos (el monto, con los separadores del idioma). */
function readForm(formData: FormData, locale: Locale) {
  const values = {
    type: String(formData.get("type") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    occurredOn: String(formData.get("occurredOn") ?? ""),
  };
  const parsed = transactionSchema(locale).safeParse(values);
  // "Aplicar 4x1000" vuelve marcado si hay un error en otro campo.
  if (!parsed.success && formData.get("gmf") === "on") Object.assign(values, { gmf: "on" });
  if (parsed.success) return { values, input: parsed.data };

  const fieldErrors: FormState["fieldErrors"] = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof NonNullable<FormState["fieldErrors"]>;
    fieldErrors[key] ??= issue.message;
  }
  return { values, fieldErrors };
}

export async function updateTransactionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Cada Server Action re-valida la sesión: nunca se confía en el cliente.
  const user = await requireUser();
  const locale = await getRequestLocale();
  const t = TEXTS[locale];
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: t.notFound };

  const { values, input, fieldErrors } = readForm(formData, locale);
  if (!input) return { ok: false, fieldErrors, values };
  // Puede conservar la categoría que ya tenía aunque el admin la haya archivado.
  if (input.categoryId && !(await isCategoryAvailable(user.id, input.categoryId, input.type, { keepFrom: id.data }))) {
    return { ok: false, fieldErrors: { categoryId: t.invalidCategory }, values };
  }

  // Solo movimientos propios y no eliminados, y sin cambiar su tipo: un egreso sigue siendo
  // egreso aunque el formulario diga otra cosa. El origen (web o WhatsApp) tampoco cambia. Si tiene 4x1000,
  // se recalcula con lo que quedó.
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(transaction)
      .set({
        amount: input.amount,
        description: input.description,
        categoryId: input.categoryId ?? null,
        occurredOn: input.occurredOn,
      })
      .where(
        and(
          eq(transaction.id, id.data),
          eq(transaction.userId, user.id),
          eq(transaction.type, input.type),
          isNull(transaction.deletedAt),
        ),
      )
      .returning({ id: transaction.id });
    if (rows.length > 0) await syncGmf({ id: id.data, userId: user.id, ...input }, tx);
    return rows;
  });
  if (updated.length === 0) return { ok: false, message: t.notFound, values };

  // La lista muestra el aviso "Cambios guardados" (?aviso=, src/lib/toasts.ts).
  redirect(listOf(input.type, input.occurredOn, user.timezone, { [TOAST_PARAM]: "guardado" }));
}

/**
 * La lista adonde vuelve un movimiento después de editarlo, borrarlo o restaurarlo: la de su tipo, en
 * el mes de su fecha (`?mes=`, si no es el actual), con el aviso que pida `extra`.
 */
const listOf = (type: "income" | "expense", occurredOn: string, timezone: string, extra?: Record<string, string>) =>
  monthHref(type === "income" ? "/ingresos" : "/egresos", monthOf(occurredOn), currentMonthRange(timezone), extra);

export async function deleteTransactionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  // Borrado lógico, filtrado por dueño: un usuario no puede tocar movimientos ajenos. Su 4x1000, si tiene, se va
  // con él (a la misma hora: así vuelve con él si se deshace).
  const now = new Date();
  const [deleted] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(transaction)
      .set({ deletedAt: now })
      .where(and(eq(transaction.id, id.data), eq(transaction.userId, user.id), isNull(transaction.deletedAt)))
      .returning({ type: transaction.type, occurredOn: transaction.occurredOn });
    if (rows.length > 0) {
      await tx
        .update(transaction)
        .set({ deletedAt: now })
        .where(and(eq(transaction.taxOf, id.data), eq(transaction.userId, user.id), isNull(transaction.deletedAt)));
    }
    return rows;
  });
  if (!deleted) {
    refresh();
    return;
  }

  // La lista muestra el aviso "Se borró… · Deshacer" (TransactionsView lee el id de la URL).
  redirect(listOf(deleted.type, deleted.occurredOn, user.timezone, { borrado: id.data }));
}

/**
 * Deshace el borrado de un movimiento propio, solo si fue hace menos de UNDO_WINDOW_MS: el aviso de
 * la lista no ofrece más que eso, y un movimiento borrado hace días no vuelve por un enlace viejo.
 */
export async function restoreTransactionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  // Su 4x1000 vuelve con él, si se borró a la misma hora (no uno que se había borrado aparte).
  const [restored] = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ deletedAt: transaction.deletedAt })
      .from(transaction)
      .where(and(eq(transaction.id, id.data), eq(transaction.userId, user.id)));
    const rows = await tx
      .update(transaction)
      .set({ deletedAt: null })
      .where(
        and(
          eq(transaction.id, id.data),
          eq(transaction.userId, user.id),
          gte(transaction.deletedAt, undoableSince(new Date())),
        ),
      )
      .returning({ type: transaction.type, occurredOn: transaction.occurredOn });
    if (rows.length > 0 && before?.deletedAt) {
      await tx
        .update(transaction)
        .set({ deletedAt: null })
        .where(and(eq(transaction.taxOf, id.data), eq(transaction.userId, user.id), eq(transaction.deletedAt, before.deletedAt)));
    }
    return rows;
  });
  if (!restored) {
    refresh();
    return;
  }

  redirect(listOf(restored.type, restored.occurredOn, user.timezone, { restaurado: id.data }));
}

export type GmfSettingState = { message?: string; tone?: ToastTone };

/** Configuración → 4x1000: prendido, el formulario de egresos lo ofrece y el bot lo pregunta. Solo la cuenta propia. */
export async function saveGmfSettingAction(_prev: GmfSettingState, formData: FormData): Promise<GmfSettingState> {
  const user = await requireUser();
  const t = TEXTS[await getRequestLocale()];
  const enabled = formData.get("enabled") === "on";
  await saveGmfEnabled(user.id, enabled);
  refresh();
  return enabled ? { message: t.gmfOn, tone: "success" } : { message: t.gmfOff, tone: "removal" };
}
