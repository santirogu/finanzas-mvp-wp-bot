"use client";

import { type ReactNode, useActionState, useEffect, useId, useRef, useState } from "react";
import { type Change, ChangeIcon } from "@/components/change-line";
import { describedBy, FieldError } from "@/components/field-error";
import { useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale, useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { formatShortDate } from "@/lib/dates";
import { formatMoney, formatShare } from "@/lib/money";
import { chooseFixedExpenseAction, type FixedExpenseState, type FixedNoteState, saveFixedNoteAction } from "@/modules/reports/actions";
import { changeDirection, type FixedHistoryEntry, NOTE_MAX_LENGTH, pctLabel } from "@/modules/reports/history";
import type { FixedOption, RecurringExpense } from "@/modules/reports/recurring";

/** El historial del valor de un gasto fijo y, en una línea, su último cambio ("↗ 11% desde marzo"; null si nunca cambió). */
export type FixedHistory = { entries: FixedHistoryEntry[]; summary: Change | null };

const TEXTS = texts(
  {
    // El error del selector antes de enviar (en vez del globo del navegador).
    messages: { description: { required: "Elige un egreso." } },
    section: "Gastos fijos",
    none: "Todavía no hay egresos que se repitan cada mes.",
    total: "Total al mes",
    share: (pct: string) => `Son el ${pct}% de tu gasto promedio por mes.`,
    removed: (n: number) => `Quitados (${n})`,
    restoreName: (description: string) => `Volver a poner ${description} en los gastos fijos`,
    restore: "Volver a poner",
    restoring: "Volviendo…",
    historyOf: "Historial de",
    inMonths: (months: number, of: number) => `En ${months} de ${of} ${of === 1 ? "mes" : "meses"}`,
    addedByYou: " · Agregado por ti",
    removeName: (description: string) => `Quitar ${description} de los gastos fijos`,
    remove: "Quitar de los gastos fijos",
    history: "Historial del valor",
    firstPayment: "Primer pago",
    editNote: "Editar nota",
    addNote: "Agregar nota",
    ofChange: (date: string) => `del cambio del ${date}`,
    noteLabel: (date: string) => `Nota del cambio del ${date}`,
    notePlaceholder: "Por qué cambió, por ejemplo",
    deleteNote: "Borrar nota",
    cancel: "Cancelar",
    saving: "Guardando…",
    saveNote: "Guardar nota",
    add: "Agregar un gasto fijo",
    expense: "Egreso",
    pick: "Elige un egreso del período",
    adding: "Agregando…",
    addShort: "Agregar",
  },
  {
    en: {
      messages: { description: { required: "Pick an expense." } },
      section: "Bills",
      none: "There are no expenses that repeat every month yet.",
      total: "Total per month",
      share: (pct) => `They're ${pct}% of your average monthly spending.`,
      removed: (n) => `Removed (${n})`,
      restoreName: (description) => `Put ${description} back in your bills`,
      restore: "Put back",
      restoring: "Putting back…",
      historyOf: "History of",
      inMonths: (months, of) => `In ${months} of ${of} ${of === 1 ? "month" : "months"}`,
      addedByYou: " · Added by you",
      removeName: (description) => `Remove ${description} from your bills`,
      remove: "Remove from your bills",
      history: "Amount history",
      firstPayment: "First payment",
      editNote: "Edit note",
      addNote: "Add note",
      ofChange: (date) => `for the change on ${date}`,
      noteLabel: (date) => `Note for the change on ${date}`,
      notePlaceholder: "Why it changed, for example",
      deleteNote: "Delete note",
      cancel: "Cancel",
      saving: "Saving…",
      saveNote: "Save note",
      add: "Add a bill",
      expense: "Expense",
      pick: "Pick an expense from the period",
      adding: "Adding…",
      addShort: "Add",
    },
  },
);

/**
 * La lista de "Gastos fijos" (/gastos-fijos, la pestaña Fijos; su título y qué cuenta como fijo los pone
 * la página): los que se detectaron solos y los que agregó la persona. Cada uno se puede
 * quitar (✕); los detectados que se quitaron quedan en "Quitados", de donde se pueden volver a poner, y
 * "Agregar un gasto fijo" suma uno de los egresos del período. Cada cambio vale para todos los períodos y
 * avisa abajo (verde si el gasto queda, rojo si sale), con el foco: lo que se tocó ya no está ahí.
 * Tocar un gasto abre el historial de su valor, con una nota por cambio.
 */
export function FixedExpenses({
  items,
  histories,
  removed,
  candidates,
  total,
  periodMonths,
  averageExpense,
  currency,
}: {
  items: RecurringExpense[];
  /** El historial de cada gasto, por su clave. */
  histories: Record<string, FixedHistory>;
  removed: FixedOption[];
  candidates: FixedOption[];
  /** Lo que suman al mes. */
  total: number;
  /** Cuántos meses tiene el período ("En 4 de 12 meses"). */
  periodMonths: number;
  /** El gasto promedio por mes del período; 0 si no hay. */
  averageExpense: number;
  currency: string;
}) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const money = (n: number) => formatMoney(n, currency, locale);
  return (
    <section className="card p-4" aria-label={t.section}>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t.none}</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <FixedItem key={item.key} item={item} history={histories[item.key]} periodMonths={periodMonths} money={money} />
            ))}
          </ul>
          {/* El total, alineado con los montos de arriba (deja el lugar del ✕: 44 px, o 32 con mouse, más el espacio). */}
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 pr-[3.25rem] text-sm font-semibold pointer-fine:pr-10">
            <span>{t.total}</span>
            <span className="whitespace-nowrap tabular-nums">−{money(total)}</span>
          </div>
          {averageExpense > 0 && <p className="mt-1 text-xs text-muted">{t.share(formatShare(total, averageExpense))}</p>}
        </>
      )}
      {candidates.length > 0 && <AddFixedExpense candidates={candidates} />}
      {removed.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand pointer-fine:min-h-8">
            {t.removed(removed.length)}
          </summary>
          <ul className="divide-y divide-border">
            {removed.map((option) => (
              <li key={option.key} className="flex items-center gap-3 py-2">
                <p className="min-w-0 flex-1 truncate">
                  <span aria-hidden>{option.emoji} </span>
                  {option.description}
                </p>
                <ChoiceForm description={option.description} action="restore">
                  {(busy) => (
                    <button
                      type="submit"
                      disabled={busy}
                      aria-label={t.restoreName(option.description)}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-background disabled:opacity-60 pointer-fine:min-h-8"
                    >
                      {busy ? t.restoring : t.restore}
                    </button>
                  )}
                </ChoiceForm>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

type Money = (n: number) => string;

const signed = (n: number, money: Money) => (n > 0 ? `+${money(n)}` : money(n));

/** Un gasto fijo: tocarlo abre el historial de su valor; el ✕ lo quita. */
function FixedItem({ item, history, periodMonths, money }: { item: RecurringExpense; history?: FixedHistory; periodMonths: number; money: Money }) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li className="py-2 text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left transition hover:bg-background"
        >
          {/* Con espacios entre las partes: el nombre del botón se lee "Historial de Arriendo En 4 de 12
              meses 5% desde marzo", no pegado. */}
          <span className="min-w-0 flex-1">
            <span className="sr-only">{t.historyOf}</span>{" "}
            {/* Cerrado se corta con "…" si no cabe; abierto se lee completo. */}
            <span className={`block ${open ? "break-words" : "truncate"}`}>
              <span aria-hidden>{item.emoji} </span>
              {item.description}
            </span>{" "}
            <span className="block text-xs text-muted">
              {t.inMonths(item.months, periodMonths)}
              {item.origin === "manual" && t.addedByYou}
            </span>
            {history?.summary && (
              <>
                {" "}
                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  <ChangeIcon direction={history.summary.direction} />
                  {/* Un porcentaje enorme (de $1 a millones) no tiene dónde partirse: que se parta donde sea. */}
                  <span className="min-w-0 wrap-anywhere">{history.summary.text}</span>
                </span>
              </>
            )}
          </span>
          <svg viewBox="0 0 20 20" fill="currentColor" className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-expense">−{money(item.amount)}</span>
        {/* Uno detectado pasa a "Quitados"; uno agregado a mano, simplemente sale. */}
        <ChoiceForm description={item.description} action={item.origin === "manual" ? "unadd" : "exclude"}>
          {(busy) => (
            <button
              type="submit"
              disabled={busy}
              aria-label={t.removeName(item.description)}
              title={t.remove}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-60 pointer-fine:size-8"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
        </ChoiceForm>
      </div>
      <div id={panelId} hidden={!open} className="mt-1 rounded-lg bg-background p-3">
        <p className="text-xs font-medium text-muted">{t.history}</p>
        <ol className="mt-1 divide-y divide-border">
          {(history?.entries ?? []).map((entry) => (
            <HistoryItem key={entry.month} description={item.description} entry={entry} money={money} />
          ))}
        </ol>
      </div>
    </li>
  );
}

/** Un cambio del historial (o el primer pago), con su nota. */
function HistoryItem({ description, entry, money }: { description: string; entry: FixedHistoryEntry; money: Money }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const [editing, setEditing] = useState(false);
  // Al cancelar, el foco vuelve al botón de la nota (si no, quedaría en la nada).
  const noteButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    noteButton.current?.focus();
  }, [editing]);
  const date = formatShortDate(entry.date, { withYear: true, locale });
  const isFirst = entry.previous === null || entry.diff === null || entry.pct === null;
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{date}</span>
        {isFirst ? (
          <span className="text-xs text-muted">{t.firstPayment}</span>
        ) : (
          <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted">
            <ChangeIcon direction={changeDirection(entry.diff!)} />
            {signed(entry.diff!, money)} ({entry.pct! > 0 ? "+" : "−"}
            {pctLabel(entry.pct!)})
          </span>
        )}
      </div>
      <p className="tabular-nums text-muted">
        {!isFirst && <span className="whitespace-nowrap">{money(entry.previous!)} → </span>}
        <span className="whitespace-nowrap font-medium text-foreground">{money(entry.amount)}</span>
      </p>
      {/* Las notas van en los cambios: el primer pago es el punto de partida. */}
      {!isFirst &&
        (editing ? (
          <NoteForm
            description={description}
            month={entry.month}
            note={entry.note}
            date={date}
            onSaved={() => setEditing(false)}
            onCancel={() => {
              refocus.current = true;
              setEditing(false);
            }}
          />
        ) : (
          <>
            {entry.note && <p className="mt-1 break-words text-xs italic text-muted">“{entry.note}”</p>}
            {/* Con la fecha para el lector de pantalla: en el historial hay un botón así por cambio. */}
            <button
              ref={noteButton}
              type="button"
              onClick={() => setEditing(true)}
              className="mt-0.5 inline-flex min-h-11 items-center text-xs font-medium text-brand pointer-fine:min-h-6"
            >
              {!entry.note && <span aria-hidden>+&nbsp;</span>}
              {entry.note ? t.editNote : t.addNote} <span className="sr-only">{t.ofChange(date)}</span>
            </button>
          </>
        ))}
    </li>
  );
}

/** La nota de un cambio: se guarda, se edita o se borra (vacía o con "Borrar nota"); Escape cancela. */
function NoteForm({
  description,
  month,
  note,
  date,
  onSaved,
  onCancel,
}: {
  description: string;
  month: string;
  note: string | null;
  date: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTexts(TEXTS);
  const toast = useToast();
  const fieldId = useId();
  const errorId = useId();
  const form = useRef<HTMLFormElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const [state, formAction, busy] = useActionState<FixedNoteState, FormData>(async (prev, formData) => {
    const result = await saveFixedNoteAction(prev, formData);
    if (result.message && result.tone) {
      onSaved();
      toast({ tone: result.tone, message: result.message, focus: true });
    }
    return result;
  }, {});
  return (
    <form
      ref={form}
      action={formAction}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onCancel();
      }}
      className="mt-1 space-y-2"
    >
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="month" value={month} />
      <label htmlFor={fieldId} className="sr-only">
        {t.noteLabel(date)}
      </label>
      {/* Con el foco al abrirse: es lo único que hay que escribir. */}
      <textarea
        ref={text}
        id={fieldId}
        name="note"
        rows={2}
        maxLength={NOTE_MAX_LENGTH}
        defaultValue={note ?? ""}
        autoFocus
        placeholder={t.notePlaceholder}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={describedBy(state.error && errorId)}
        className="input w-full"
      />
      <FieldError id={errorId} message={state.error} />
      <div className="flex flex-wrap justify-end gap-2">
        {note && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              text.current!.value = "";
              form.current!.requestSubmit();
            }}
            className="mr-auto inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60 pointer-fine:min-h-8"
          >
            {t.deleteNote}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-background pointer-fine:min-h-8"
        >
          {t.cancel}
        </button>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? t.saving : t.saveNote}
        </button>
      </div>
    </form>
  );
}

/** Con éxito, el aviso emergente (verde o rojo) con el foco; un error queda al lado del botón. */
function useChoice(onDone?: () => void) {
  const toast = useToast();
  return useActionState<FixedExpenseState, FormData>(async (prev, formData) => {
    const result = await chooseFixedExpenseAction(prev, formData);
    if (result.message && result.tone) {
      onDone?.();
      toast({ tone: result.tone, message: result.message, focus: true });
    }
    return result;
  }, {});
}

/** Un botón que manda una marca (quitar o volver a poner) de un gasto. */
function ChoiceForm({
  description,
  action,
  children,
}: {
  description: string;
  action: "exclude" | "restore" | "unadd";
  children: (busy: boolean) => ReactNode;
}) {
  const [state, formAction, busy] = useChoice();
  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end">
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="action" value={action} />
      {children(busy)}
      {state.error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** "Agregar un gasto fijo": elegir uno de los egresos del período (uno que todavía lleva pocos meses). */
function AddFixedExpense({ candidates }: { candidates: FixedOption[] }) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const fieldId = useId();
  const errorId = useId();
  const { errors, formProps } = useFieldErrors(t.messages);
  const [state, formAction, busy] = useChoice(() => setOpen(false));
  const close = () => {
    setOpen(false);
    // El foco vuelve al botón que abrió el formulario (cuando vuelve a aparecer).
    setTimeout(() => opener.current?.focus());
  };
  const error = errors.description ?? state.error;

  if (!open) {
    return (
      <button
        ref={opener}
        type="button"
        aria-expanded={false}
        aria-controls={formId}
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-background pointer-fine:min-h-8"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
        </svg>
        {t.add}
      </button>
    );
  }

  return (
    <form id={formId} action={formAction} {...formProps} className="mt-3 space-y-2 border-t border-border pt-3">
      <input type="hidden" name="action" value="include" />
      <label htmlFor={fieldId} className="block text-sm font-medium">
        {t.expense}
      </label>
      {/* Con el foco al abrirse: es lo único que hay que elegir. */}
      <select
        id={fieldId}
        name="description"
        required
        autoFocus
        defaultValue=""
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(error && errorId)}
        className="input w-full"
      >
        <option value="" disabled>
          {t.pick}
        </option>
        {candidates.map((option) => (
          <option key={option.key} value={option.description}>
            {option.emoji} {option.description}
          </option>
        ))}
      </select>
      <FieldError id={errorId} message={error} />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={close}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-background pointer-fine:min-h-8"
        >
          {t.cancel}
        </button>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? t.adding : t.addShort}
        </button>
      </div>
    </form>
  );
}
