import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { amountInputValue, formatMoney, formatPercent, roundToCents } from "@/lib/money";

// Los presupuestos del mes (la tarjeta del Resumen y Configuración): cuánto lleva cada categoría frente a su
// presupuesto. Desde `nearShare` (el que eligió el admin en Valores de la app; si no, NEAR_SHARE) se acerca; si lo
// supera, se pasó. Los avisos usan los mismos umbrales.

/** Desde qué porcentaje del presupuesto una categoría "se acerca" al límite, si el admin no eligió otro. */
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
export function budgetLevel(spent: number, amount: number, nearShare = NEAR_SHARE): BudgetLevel {
  if (spent > amount) return "over";
  return spent * 100 >= amount * nearShare ? "near" : "ok";
}

/**
 * Cada presupuesto con lo que lleva su categoría este mes (`spent`, por id de categoría), de la que está más cerca
 * del límite (o más pasada) a la más lejos; si empatan, por nombre.
 */
export function budgetProgress(
  budgets: Budget[],
  spent: ReadonlyMap<string, number>,
  locale: Locale = DEFAULT_LOCALE,
  nearShare = NEAR_SHARE,
): BudgetProgress[] {
  const collator = new Intl.Collator(locale);
  return budgets
    .map((budget) => {
      const total = spent.get(budget.categoryId) ?? 0;
      return { ...budget, spent: total, share: Math.round((total / budget.amount) * 100), level: budgetLevel(total, budget.amount, nearShare) };
    })
    .sort((a, b) => b.spent / b.amount - a.spent / a.amount || collator.compare(a.name, b.name));
}

const RANK: Readonly<Record<BudgetLevel, number>> = { ok: 0, near: 1, over: 2 };

/** Un presupuesto que acaba de cruzar un umbral: el de "se acerca" ("near", el 80 % de siempre) o el límite ("over"). */
export type BudgetCrossing = Pick<Budget, "categoryId" | "name" | "amount"> & { level: "near" | "over"; spent: number; share: number };

/**
 * Los presupuestos que cruzan un umbral con lo que se acaba de registrar (`added`, lo que suma por categoría; `spent`,
 * lo de la categoría en el mes ya con eso): llegar a `nearShare` o pasarse. Si cruza los dos de una vez, solo el de
 * pasarse. Lo que ya estaba cerca o pasado no vuelve a avisar: así cada aviso sale una vez por mes y categoría, sin
 * guardar nada (decisión del dueño).
 */
export function budgetCrossings(
  budgets: Budget[],
  spent: ReadonlyMap<string, number>,
  added: ReadonlyMap<string, number>,
  nearShare = NEAR_SHARE,
): BudgetCrossing[] {
  return budgets.flatMap((budget) => {
    const plus = added.get(budget.categoryId) ?? 0;
    if (plus <= 0) return [];
    const after = spent.get(budget.categoryId) ?? 0;
    const level = budgetLevel(after, budget.amount, nearShare);
    if (level === "ok" || RANK[level] <= RANK[budgetLevel(roundToCents(after - plus), budget.amount, nearShare)]) return [];
    return [
      {
        categoryId: budget.categoryId,
        name: budget.name,
        amount: budget.amount,
        level,
        spent: after,
        share: Math.round((after / budget.amount) * 100),
      },
    ];
  });
}

const TEXTS = texts(
  {
    near: (name: string, spent: string, amount: string, share: string) => `${name}: llevas ${spent} de ${amount} (${share})`,
    overBy: (name: string, over: string, spent: string, amount: string) => `${name}: te pasaste del presupuesto por ${over} (${spent} de ${amount})`,
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
      near: (name, spent, amount, share) => `${name}: ${spent} of ${amount} so far (${share})`,
      overBy: (name, over, spent, amount) => `${name}: ${over} over budget (${spent} of ${amount})`,
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

/**
 * El aviso de un presupuesto que cruzó un umbral: "Mercado: llevas $410.000,00 de $500.000,00 (82 %)" o "Mercado: te
 * pasaste del presupuesto por $10.000,00 ($510.000,00 de $500.000,00)". El bot le pone su emoji adelante.
 */
export function budgetAlert(crossing: BudgetCrossing, currency: string, locale: Locale = DEFAULT_LOCALE): string {
  const t = TEXTS[locale];
  const money = (n: number) => formatMoney(n, currency, locale);
  const percent = new Intl.NumberFormat(INTL_LOCALES[locale]);
  return crossing.level === "over"
    ? t.overBy(crossing.name, money(roundToCents(crossing.spent - crossing.amount)), money(crossing.spent), money(crossing.amount))
    : t.near(crossing.name, money(crossing.spent), money(crossing.amount), formatPercent(percent.format(crossing.share), locale));
}
