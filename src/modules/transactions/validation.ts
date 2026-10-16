import { z } from "zod";
import { formatMoney, MAX_AMOUNT, parseAmountInput } from "@/lib/money";
import { withoutControlChars } from "@/lib/text";

export const transactionTypeSchema = z.enum(["income", "expense"]);

// Stryker disable next-line StringLiteral: la app solo usa el mensaje del error, no su código
const amountIssue = (message: string) => ({ code: "custom" as const, message });

// El formulario web. El monto, en pesos con hasta dos decimales (centavos).
export const newTransactionSchema = z.object({
  type: transactionTypeSchema,
  amount: z
    .string()
    .transform((value, ctx) => {
      const parsed = parseAmountInput(value);
      if (parsed === null) {
        ctx.addIssue(amountIssue("Ingresa un monto mayor que cero"));
        return z.NEVER;
      }
      if (parsed > MAX_AMOUNT) {
        ctx.addIssue(amountIssue(`El monto no puede pasar de ${formatMoney(MAX_AMOUNT)}`));
        return z.NEVER;
      }
      return parsed;
    }),
  // Sin caracteres de control (pegados de otro lado): no se ven y el nulo haría fallar la base.
  description: z
    .string()
    .transform(withoutControlChars)
    .pipe(z.string().trim().min(1, "Agrega una descripción").max(140, "Máximo 140 caracteres")),
  categoryId: z.uuid("Selecciona una categoría").optional().or(z.literal("").transform(() => undefined)),
  occurredOn: z.iso.date("Fecha inválida"),
});

export type NewTransactionInput = z.output<typeof newTransactionSchema>;
