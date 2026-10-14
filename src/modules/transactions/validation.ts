import { z } from "zod";
import { parseAmountInput } from "@/lib/money";

export const transactionTypeSchema = z.enum(["income", "expense"]);

// Compartido por el formulario web y, más adelante, por el bot de WhatsApp.
export const newTransactionSchema = z.object({
  type: transactionTypeSchema,
  amount: z
    .string()
    .transform((value, ctx) => {
      const parsed = parseAmountInput(value);
      if (parsed === null) {
        ctx.addIssue({ code: "custom", message: "Ingresa un monto mayor que cero" });
        return z.NEVER;
      }
      return parsed;
    }),
  description: z
    .string()
    .trim()
    .min(1, "Agrega una descripción")
    .max(140, "Máximo 140 caracteres"),
  categoryId: z.uuid("Selecciona una categoría").optional().or(z.literal("").transform(() => undefined)),
  occurredOn: z.iso.date("Fecha inválida"),
});

export type NewTransactionInput = z.output<typeof newTransactionSchema>;
