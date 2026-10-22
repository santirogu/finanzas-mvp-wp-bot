import { z } from "zod";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { formatMoney, MAX_AMOUNT, parseAmountInput } from "@/lib/money";
import { withoutControlChars } from "@/lib/text";

const TEXTS = texts(
  {
    amount: "Escribe un monto mayor que cero.",
    tooMuch: (max: string) => `El monto no puede pasar de ${max}.`,
    description: "Escribe una descripción.",
    tooLong: "La descripción puede tener hasta 140 caracteres.",
    category: "Elige una categoría.",
    date: "Elige una fecha válida.",
  },
  {
    en: {
      amount: "Enter an amount greater than zero.",
      tooMuch: (max) => `The amount can't be more than ${max}.`,
      description: "Enter a description.",
      tooLong: "The description can have up to 140 characters.",
      category: "Choose a category.",
      date: "Choose a valid date.",
    },
  },
);

export const transactionTypeSchema = z.enum(["income", "expense"]);

// Stryker disable next-line StringLiteral: la app solo usa el mensaje del error, no su código
const amountIssue = (message: string) => ({ code: "custom" as const, message });

/**
 * Un monto escrito en un formulario, en el idioma de la página: se lee con sus separadores (en inglés,
 * "1,250.50"), mayor que cero y hasta MAX_AMOUNT, en pesos con hasta dos decimales (centavos). Lo usan los
 * movimientos y los presupuestos.
 */
export function amountSchema(locale: Locale) {
  const t = TEXTS[locale];
  return z.string().transform((value, ctx) => {
    const parsed = parseAmountInput(value, locale);
    if (parsed === null) {
      ctx.addIssue(amountIssue(t.amount));
      return z.NEVER;
    }
    if (parsed > MAX_AMOUNT) {
      ctx.addIssue(amountIssue(t.tooMuch(formatMoney(MAX_AMOUNT, "COP", locale))));
      return z.NEVER;
    }
    return parsed;
  });
}

/** El formulario web de un movimiento, en el idioma de la página (los mensajes salen en ese idioma). */
export function transactionSchema(locale: Locale) {
  const t = TEXTS[locale];
  return z.object({
    type: transactionTypeSchema,
    amount: amountSchema(locale),
    // Sin caracteres de control (pegados de otro lado): no se ven y el nulo haría fallar la base.
    description: z.string().transform(withoutControlChars).pipe(z.string().trim().min(1, t.description).max(140, t.tooLong)),
    categoryId: z.uuid(t.category).optional().or(z.literal("").transform(() => undefined)),
    occurredOn: z.iso.date(t.date),
  });
}

/** En español (el idioma de siempre). */
export const newTransactionSchema = transactionSchema(DEFAULT_LOCALE);

export type NewTransactionInput = z.output<typeof newTransactionSchema>;
