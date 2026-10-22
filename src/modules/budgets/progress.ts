import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { amountInputValue, formatMoney, formatPercent, roundToCents } from "@/lib/money";

// Los presupuestos del mes (la tarjeta del Resumen y /presupuestos): cuánto lleva cada categoría frente a su
// presupuesto. Desde NEAR_SHARE se acerca; si lo supera, se pasó. Los avisos usan los mismos umbrales.

/** Desde qué porcentaje del presupuesto una categoría "se acerca" al límite. */
export const NEAR_SHARE = 80;

export type Budget = {
  categoryId: string;
  /** El nombre de la categoría en el idioma de la página. */
  name: string;
  emoji: string;
  amount: number;
  /** La categoría la archivó el admin: el presupuesto sigue, pero no se puede elegir para uno nuevo. */
  archived: boolean;
};

export type BudgetLevel = "ok" | "near" | "over";

export type BudgetProgress = Budget & {
  /** Lo que suman este mes los egresos de la categoría. */
  spent: number;
  /** El porcentaje del presupuesto, redondeado. */
  share: number;
  level: BudgetLevel;
};

/** En qué punto está lo gastado frente al presupuesto. */
export function budgetLevel(spent: number, amount: number): BudgetLevel {
  if (spent > amount) return "over";
  return spent * 100 >= amount * NEAR_SHARE ? "near" : "ok";
}

/**
 * Cada presupuesto con lo que lleva su categoría este mes (`spent`, por id de categoría), de la que está más cerca
 * del límite (o más pasada) a la más lejos; si empatan, por nombre.
 */
export function budgetProgress(budgets: Budget[], spent: ReadonlyMap<string, number>, locale: Locale = DEFAULT_LOCALE): BudgetProgress[] {
  const collator = new Intl.Collator(locale);
  return budgets
    .map((budget) => {
      const total = spent.get(budget.categoryId) ?? 0;
      return { ...budget, spent: total, share: Math.round((total / budget.amount) * 100), level: budgetLevel(total, budget.amount) };
    })
    .sort((a, b) => b.spent / b.amount - a.spent / a.amount || collator.compare(a.name, b.name));
}

const TEXTS = texts(
  {
    of: (spent: string, amount: string) => `${spent} de ${amount}`,
    left: (amount: string) => `Te quedan ${amount}`,
    over: (amount: string) => `Te pasaste por ${amount}`,
    archived: "Categoría archivada",
  },
  {
    en: {
      of: (spent, amount) => `${spent} of ${amount}`,
      left: (amount) => `${amount} left`,
      over: (amount) => `${amount} over`,
      archived: "Archived category",
    },
  },
);

export type BudgetRow = {
  categoryId: string;
  name: string;
  emoji: string;
  level: BudgetLevel;
  /** "$410.000,00 de $500.000,00". */
  spentOf: string;
  /** "82 %". */
  share: string;
  /** El largo de la barra, de 0 a 100. */
  bar: number;
  /** "Te quedan $90.000,00" o "Te pasaste por $10.000,00". */
  note: string;
  archived: string | null;
  /** El monto para el campo de "Cambiar", como lo escribe la persona ("500.000,00"). */
  amountInput: string;
};

/** Las filas de los presupuestos, con sus textos en el idioma de la página. */
export function budgetRows(progress: BudgetProgress[], currency: string, locale: Locale = DEFAULT_LOCALE): BudgetRow[] {
  const t = TEXTS[locale];
  const money = (n: number) => formatMoney(n, currency, locale);
  // Con el punto de los miles: una categoría puede pasarse por mucho ("1.250 %").
  const percent = new Intl.NumberFormat(INTL_LOCALES[locale]);
  return progress.map((p) => ({
    categoryId: p.categoryId,
    name: p.name,
    emoji: p.emoji,
    level: p.level,
    spentOf: t.of(money(p.spent), money(p.amount)),
    share: formatPercent(percent.format(p.share), locale),
    bar: Math.min(100, p.share),
    note: p.level === "over" ? t.over(money(roundToCents(p.spent - p.amount))) : t.left(money(roundToCents(p.amount - p.spent))),
    archived: p.archived ? t.archived : null,
    amountInput: amountInputValue(p.amount, locale),
  }));
}
