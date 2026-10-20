import { z } from "zod";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { formatMoney, MAX_AMOUNT, parseAmountInput } from "@/lib/money";
import { withoutControlChars } from "@/lib/text";

const TEXTS = texts(
  {
    amount: "Ingresa un monto mayor que cero",
    tooMuch: (max: string) => `El monto no puede pasar de ${max}`,
    description: "Agrega una descripción",
    tooLong: "Máximo 140 caracteres",
    category: "Selecciona una categoría",
    date: "Fecha inválida",
  },
  {
    en: {
      amount: "Enter an amount greater than zero",
      tooMuch: (max) => `The amount can't be more than ${max}`,
      description: "Add a description",
      tooLong: "At most 140 characters",
      category: "Pick a category",
      date: "Invalid date",
    },
  },
);

export const transactionTypeSchema = z.enum(["income", "expense"]);

// Stryker disable next-line StringLiteral: la app solo usa el mensaje del error, no su código
const amountIssue = (message: string) => ({ code: "custom" as const, message });

/**
 * El formulario web, en el idioma de la página: el monto se lee con sus separadores (en inglés, "1,250.50")
 * y los mensajes salen en ese idioma. El monto, en pesos con hasta dos decimales (centavos).
 */
export function transactionSchema(locale: Locale) {
  const t = TEXTS[locale];
  return z.object({
    type: transactionTypeSchema,
    amount: z.string().transform((value, ctx) => {
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
    }),
    // Sin caracteres de control (pegados de otro lado): no se ven y el nulo haría fallar la base.
    description: z.string().transform(withoutControlChars).pipe(z.string().trim().min(1, t.description).max(140, t.tooLong)),
    categoryId: z.uuid(t.category).optional().or(z.literal("").transform(() => undefined)),
    occurredOn: z.iso.date(t.date),
  });
}

/** En español (el idioma de siempre). */
export const newTransactionSchema = transactionSchema(DEFAULT_LOCALE);

export type NewTransactionInput = z.output<typeof newTransactionSchema>;
