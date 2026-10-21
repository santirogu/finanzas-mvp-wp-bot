"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CATEGORY_NAME_MAX, CATEGORY_TYPE_TEXTS, DEFAULT_CATEGORY, EMOJI_SUGGESTIONS, type CategoryType } from "@/modules/admin/categories/category-input";
import { describedBy } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale, useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { type ToastTone, useToast } from "@/components/toaster";
import { Buttons, CODE_FIELD_TEXTS, CodeField, Dialog, FormError } from "../admin-dialog";
import {
  archiveCategoryAction,
  createCategoryAction,
  deleteCategoryAction,
  restoreCategoryAction,
  updateCategoryAction,
  type CategoryActionState,
} from "./actions";

// Las categorías de un tipo en /admin/categorias: las activas (alfabéticas, "Otros" al final) y las
// archivadas, con sus acciones. Crear, editar y restaurar no piden código; archivar y eliminar, sí.
// El servidor vuelve a validar todo. Los textos, en el idioma de la página; los nombres de las categorías
// (también "Otros"), tal cual.

export type ManagedCategory = {
  id: string;
  name: string;
  /** El nombre con la app en inglés (null: se ve `name`). */
  nameEn: string | null;
  emoji: string;
  archived: boolean;
  movements: number;
  isDefault: boolean;
};

type ServerAction = (prev: CategoryActionState, formData: FormData) => Promise<CategoryActionState>;
type Open =
  | { kind: "create" }
  | { kind: "edit"; category: ManagedCategory }
  | { kind: "archive"; category: ManagedCategory }
  | { kind: "delete"; category: ManagedCategory }
  | null;

const TEXTS = texts(
  {
    intro: "Se aplican de inmediato en los formularios y en el bot.",
    newCategory: "Nueva categoría",
    list: (type: CategoryType) => `Categorías de ${type === "expense" ? "egresos" : "ingresos"}`,
    archivedList: (type: CategoryType) => `Categorías archivadas de ${type === "expense" ? "egresos" : "ingresos"}`,
    archive: "Archivar",
    delete: "Eliminar",
    archivedTitle: "Archivadas",
    archivedIntro: "No aparecen en los formularios ni las usa el bot; sus movimientos las conservan.",
    archiveQuestion: (name: string) => `¿Archivar la categoría ${name}?`,
    archiving: "Archivando…",
    archiveBody: (n: number) =>
      `Dejará de aparecer en los formularios y el bot no la usará. ${
        n === 0 ? "No tiene movimientos." : n === 1 ? "El movimiento que ya la tiene la conserva." : `Los ${n} movimientos que ya la tienen la conservan.`
      } Puedes restaurarla cuando quieras.`,
    deleteQuestion: (name: string) => `¿Eliminar la categoría ${name}?`,
    deleteAndMove: `Eliminar y pasar a ${DEFAULT_CATEGORY}`,
    deleting: "Eliminando…",
    deleteWarning: (count: number, movements: string, fallback: string) =>
      `Tiene ${movements}. Si la eliminas, ${count === 1 ? "pasará" : "pasarán"} a ${fallback}. La eliminación queda en el registro de cambios y no se puede deshacer.`,
    archiveInstead: "Si solo quieres que no se use más, archívala: los movimientos la conservan.",
    deleteEmpty: "No tiene movimientos. La eliminación queda en el registro de cambios y no se puede deshacer.",
    movements: (n: number): string => (n === 0 ? "Sin movimientos" : `${n} ${n === 1 ? "movimiento" : "movimientos"}`),
    byDefault: "Por defecto",
    onlyEmoji: " · su nombre no se cambia",
    inEnglish: (name: string) => ` · en inglés: ${name}`,
    edit: "Editar",
    editLabel: (name: string) => `Editar ${name}`,
    more: (name: string) => `Más acciones para ${name}`,
    asksCode: "Pide el código",
    restore: "Restaurar",
    restoring: "Restaurando…",
    restoreLabel: (name: string) => `Restaurar ${name}`,
    editTitle: (name: string) => `Editar la categoría ${name}`,
    newTitle: (type: CategoryType) => `Nueva categoría de ${type === "expense" ? "egresos" : "ingresos"}`,
    formIntro: (typeName: string) => `${typeName} · se aplica de inmediato en los formularios y en el bot.`,
    renameNote: " Los movimientos que ya la usan pasan a verse con el nombre nuevo.",
    name: "Nombre",
    nameEn: "Nombre en inglés",
    nameEnHelp: "Así se ve con la app en inglés. Si lo dejas vacío, en inglés se ve el nombre de arriba. El bot usa siempre el de arriba.",
    defaultOnlyEmoji: `A “${DEFAULT_CATEGORY}” solo se le pueden cambiar el emoji y el nombre en inglés.`,
    emoji: "Emoji",
    optional: "(opcional)",
    emojiHelp: "Toca uno de los sugeridos o escribe otro. Si lo dejas vacío, la categoría se mostrará con un punto (•).",
    suggested: "Emojis sugeridos",
    use: (emoji: string) => `Usar ${emoji}`,
    save: "Guardar",
    saving: "Guardando…",
    create: "Crear",
    creating: "Creando…",
    // El error del nombre antes de enviar (en vez del globo del navegador).
    nameRequired: "Escribe un nombre.",
  },
  {
    en: {
      intro: "They apply right away in the forms and in the bot.",
      newCategory: "New category",
      list: (type) => `${type === "expense" ? "Expense" : "Income"} categories`,
      archivedList: (type) => `Archived ${type === "expense" ? "expense" : "income"} categories`,
      archive: "Archive",
      delete: "Delete",
      archivedTitle: "Archived",
      archivedIntro: "They don't show up in the forms and the bot doesn't use them; their transactions keep them.",
      archiveQuestion: (name) => `Archive the category ${name}?`,
      archiving: "Archiving…",
      archiveBody: (n) =>
        `It will stop showing up in the forms and the bot won't use it. ${
          n === 0 ? "It has no transactions." : n === 1 ? "The transaction that already has it keeps it." : `The ${n} transactions that already have it keep it.`
        } You can restore it whenever you want.`,
      deleteQuestion: (name) => `Delete the category ${name}?`,
      deleteAndMove: `Delete and move to ${DEFAULT_CATEGORY}`,
      deleting: "Deleting…",
      deleteWarning: (count, movements, fallback) =>
        `It has ${movements}. If you delete it, ${count === 1 ? "it'll" : "they'll"} move to ${fallback}. The deletion stays in the change log and can't be undone.`,
      archiveInstead: "If you just want it not to be used anymore, archive it: the transactions keep it.",
      deleteEmpty: "It has no transactions. The deletion stays in the change log and can't be undone.",
      movements: (n) => (n === 0 ? "No transactions" : `${n} ${n === 1 ? "transaction" : "transactions"}`),
      byDefault: "Default",
      onlyEmoji: " · its name can't change",
      inEnglish: (name) => ` · English: ${name}`,
      edit: "Edit",
      editLabel: (name) => `Edit ${name}`,
      more: (name) => `More actions for ${name}`,
      asksCode: "Asks for the code",
      restore: "Restore",
      restoring: "Restoring…",
      restoreLabel: (name) => `Restore ${name}`,
      editTitle: (name) => `Edit the category ${name}`,
      newTitle: (type) => `New ${type === "expense" ? "expense" : "income"} category`,
      formIntro: (typeName) => `${typeName} · it applies right away in the forms and in the bot.`,
      renameNote: " The transactions that already use it will show the new name.",
      name: "Name",
      nameEn: "English name",
      nameEnHelp: "This is what you see with the app in English. If you leave it empty, English shows the name above. The bot always uses the name above.",
      defaultOnlyEmoji: `Only the emoji and the English name of “${DEFAULT_CATEGORY}” can be changed.`,
      emoji: "Emoji",
      optional: "(optional)",
      emojiHelp: "Tap one of the suggestions or type another. If you leave it empty, the category will show a dot (•).",
      suggested: "Suggested emojis",
      use: (emoji) => `Use ${emoji}`,
      save: "Save",
      saving: "Saving…",
      create: "Create",
      creating: "Creating…",
      nameRequired: "Enter a name.",
    },
  },
);

export function CategoryManager({ type, categories }: { type: CategoryType; categories: ManagedCategory[] }) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState<Open>(null);
  const toast = useToast();
  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);
  const fallbackEmoji = categories.find((c) => c.isDefault)?.emoji ?? "📦";
  const start = (next: Open) => setOpen(next);
  const close = () => setOpen(null);
  // Con éxito, la ventana se cierra y el aviso emergente (verde o rojo) recibe el foco: el botón que la
  // abrió a veces ya no está (la fila pasó a Archivadas).
  const finish = (tone: ToastTone) => (message: string) => {
    setOpen(null);
    toast({ tone, message, focus: true });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{t.intro}</p>
        <button type="button" onClick={() => start({ kind: "create" })} className="btn-primary shrink-0">
          {t.newCategory}
        </button>
      </div>

      <ul aria-label={t.list(type)} className="divide-y divide-border">
        {active.map((category) => (
          <CategoryRow key={category.id} category={category} onEdit={() => start({ kind: "edit", category })}>
            {category.isDefault ? (
              // "Otros" no se archiva ni se elimina: el espacio del "⋯" queda vacío, para que su
              // "Editar" se alinee con los de las demás filas.
              <span aria-hidden className="invisible rounded-lg border px-2.5 py-1.5 text-sm font-medium">
                ⋯
              </span>
            ) : (
              <MoreActions
                name={category.name}
                actions={[
                  { label: t.archive, onClick: () => start({ kind: "archive", category }) },
                  { label: t.delete, danger: true, onClick: () => start({ kind: "delete", category }) },
                ]}
              />
            )}
          </CategoryRow>
        ))}
      </ul>

      {archived.length > 0 && (
        <section aria-labelledby={`archivadas-${type}`} className="space-y-1 pt-2">
          <h3 id={`archivadas-${type}`} className="text-sm font-medium text-muted">
            {t.archivedTitle}
          </h3>
          <p className="text-xs text-muted">{t.archivedIntro}</p>
          <ul aria-label={t.archivedList(type)} className="divide-y divide-border">
            {archived.map((category) => (
              <CategoryRow key={category.id} category={category}>
                <RestoreButton category={category} onDone={finish("success")} />
                <MoreActions name={category.name} actions={[{ label: t.delete, danger: true, onClick: () => start({ kind: "delete", category }) }]} />
              </CategoryRow>
            ))}
          </ul>
        </section>
      )}

      {open?.kind === "create" && <CategoryFormDialog type={type} onClose={close} onDone={finish("success")} />}
      {open?.kind === "edit" && (
        <CategoryFormDialog type={type} category={open.category} onClose={close} onDone={finish("success")} />
      )}
      {open?.kind === "archive" && (
        <CodeDialog
          title={t.archiveQuestion(open.category.name)}
          action={archiveCategoryAction}
          id={open.category.id}
          submit={t.archive}
          pending={t.archiving}
          onClose={close}
          onDone={finish("removal")}
          description={t.archiveBody(open.category.movements)}
        />
      )}
      {open?.kind === "delete" && (
        <CodeDialog
          title={t.deleteQuestion(open.category.name)}
          action={deleteCategoryAction}
          id={open.category.id}
          submit={open.category.movements > 0 ? t.deleteAndMove : t.delete}
          pending={t.deleting}
          danger
          onClose={close}
          onDone={finish("removal")}
          description={
            open.category.movements > 0 ? (
              <>
                <span className="block rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
                  {t.deleteWarning(open.category.movements, t.movements(open.category.movements), `${fallbackEmoji} ${DEFAULT_CATEGORY}`)}
                </span>
                {/* El espacio separa las dos frases para los lectores de pantalla (los bloques no lo ponen). */}
                {!open.category.archived && (
                  <>
                    {" "}
                    <span className="mt-2 block">{t.archiveInstead}</span>
                  </>
                )}
              </>
            ) : (
              t.deleteEmpty
            )
          }
        />
      )}
    </div>
  );
}

function CategoryRow({ category, onEdit, children }: { category: ManagedCategory; onEdit?: () => void; children?: ReactNode }) {
  const t = useTexts(TEXTS);
  return (
    <li className="flex items-center gap-3 py-3">
      <span aria-hidden className={`flex size-9 flex-none items-center justify-center rounded-lg bg-chip text-lg ${category.archived ? "grayscale" : ""}`}>
        {category.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`flex flex-wrap items-center gap-2 text-sm font-medium ${category.archived ? "text-muted" : ""}`}>
          <span className="break-words">{category.name}</span>
          {category.isDefault && <span className="rounded-full border border-border px-2 text-xs font-normal text-muted">{t.byDefault}</span>}
        </p>
        <p className="text-xs text-muted">
          {t.movements(category.movements)}
          {category.nameEn && t.inEnglish(category.nameEn)}
          {category.isDefault && t.onlyEmoji}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={t.editLabel(category.name)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background"
          >
            {t.edit}
          </button>
        )}
        {children}
      </div>
    </li>
  );
}

/** El botón "⋯": muestra las acciones que piden el código (un desplegable simple, no un menú). */
function MoreActions({ name, actions }: { name: string; actions: { label: string; danger?: boolean; onClick: () => void }[] }) {
  const t = useTexts(TEXTS);
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Abierto, se cierra con Esc (y el foco vuelve al "⋯") o al tocar fuera de él.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setExpanded(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setExpanded(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);
  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={t.more(name)}
        onClick={() => setExpanded(!expanded)}
        className="rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium hover:bg-background"
      >
        <span aria-hidden>⋯</span>
      </button>
      <div
        id={panelId}
        hidden={!expanded}
        className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg"
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => {
              setExpanded(false);
              // El elemento del menú se oculta: con el foco en el "⋯", la ventana que se abre lo
              // devuelve ahí al cancelarla (si no, quedaría al principio de la página).
              button.current?.focus();
              action.onClick();
            }}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-background ${action.danger ? "text-danger" : ""}`}
          >
            {action.label}
            <span className="block text-xs text-muted">{t.asksCode}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Restaurar no pide código: solo deshace un archivado. */
function RestoreButton({ category, onDone }: { category: ManagedCategory; onDone: (message: string) => void }) {
  const t = useTexts(TEXTS);
  const [state, formAction, busy] = useNotifyingAction(restoreCategoryAction, onDone);
  return (
    <form action={formAction} className="flex flex-col items-end">
      <input type="hidden" name="id" value={category.id} />
      <button
        type="submit"
        disabled={busy}
        aria-label={t.restoreLabel(category.name)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-60"
      >
        {busy ? t.restoring : t.restore}
      </button>
      {state.error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Con éxito, la ventana se cierra y aparece el aviso emergente (la página se vuelve a dibujar). */
function useNotifyingAction(action: ServerAction, onDone: (message: string) => void) {
  return useActionState<CategoryActionState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.message) onDone(result.message);
    return result;
  }, {});
}

function CategoryFormDialog({
  type,
  category,
  onClose,
  onDone,
}: {
  type: CategoryType;
  category?: ManagedCategory;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const editing = Boolean(category);
  const [state, formAction, busy] = useNotifyingAction(editing ? updateCategoryAction : createCategoryAction, onDone);
  const { errors, formProps } = useFieldErrors({ name: { required: t.nameRequired } });
  // El del navegador (antes de enviar) o el del servidor (un nombre repetido, p. ej.).
  const nameMessage = errors.name ?? (state.field === "name" ? state.error : undefined);
  const nameEnMessage = state.field === "nameEn" ? state.error : undefined;
  const nameEnError = useId();
  const nameEnHelp = useId();
  const [emoji, setEmoji] = useState(category?.emoji ?? "");
  const nameError = useId();
  const emojiError = useId();
  const emojiHelp = useId();

  return (
    <Dialog title={category ? t.editTitle(category.name) : t.newTitle(type)} onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            {t.formIntro(CATEGORY_TYPE_TEXTS[locale][type])}
            {category && category.movements > 0 && t.renameNote}
          </p>
          {category ? <input type="hidden" name="id" value={category.id} /> : <input type="hidden" name="type" value={type} />}
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t.name}</span>
              <input
                name="name"
                required
                maxLength={CATEGORY_NAME_MAX}
                defaultValue={category?.name ?? ""}
                readOnly={category?.isDefault}
                autoComplete="off"
                aria-invalid={Boolean(nameMessage) || undefined}
                aria-describedby={describedBy(nameMessage && nameError)}
                className="input read-only:bg-background read-only:text-muted"
              />
            </label>
            {category?.isDefault && <p className="text-xs text-muted">{t.defaultOnlyEmoji}</p>}
            {nameMessage && (
              <p id={nameError} className="text-xs text-danger">
                {nameMessage}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium">
                {t.nameEn} <span className="font-normal text-muted">{t.optional}</span>
              </span>
              <input
                name="nameEn"
                lang="en"
                maxLength={CATEGORY_NAME_MAX}
                defaultValue={category?.nameEn ?? ""}
                autoComplete="off"
                aria-invalid={Boolean(nameEnMessage) || undefined}
                aria-describedby={describedBy(nameEnHelp, nameEnMessage && nameEnError)}
                className="input"
              />
            </label>
            <p id={nameEnHelp} className="text-xs text-muted">
              {t.nameEnHelp}
            </p>
            {nameEnMessage && (
              <p id={nameEnError} className="text-xs text-danger">
                {nameEnMessage}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium">
                {t.emoji} <span className="font-normal text-muted">{t.optional}</span>
              </span>
              <input
                name="emoji"
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
                autoComplete="off"
                aria-invalid={state.field === "emoji" || undefined}
                aria-describedby={state.field === "emoji" ? `${emojiHelp} ${emojiError}` : emojiHelp}
                className="input block w-20 text-center text-lg"
              />
            </label>
            <p id={emojiHelp} className="text-xs text-muted">
              {t.emojiHelp}
            </p>
            <div role="group" aria-label={t.suggested} className="flex flex-wrap gap-1">
              {EMOJI_SUGGESTIONS[type].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  aria-label={t.use(suggestion)}
                  aria-pressed={emoji === suggestion}
                  onClick={() => setEmoji(suggestion)}
                  className="size-9 rounded-lg border border-border text-lg hover:bg-background aria-pressed:border-brand aria-pressed:bg-brand/10"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            {state.field === "emoji" && (
              <p id={emojiError} className="text-xs text-danger">
                {state.error}
              </p>
            )}
          </div>
          <FormError state={state} />
          <Buttons submit={editing ? t.save : t.create} pending={editing ? t.saving : t.creating} busy={busy} />
        </form>
      )}
    </Dialog>
  );
}

function CodeDialog({
  title,
  description,
  action,
  id,
  submit,
  pending,
  danger = false,
  onClose,
  onDone,
}: {
  title: string;
  description: ReactNode;
  action: ServerAction;
  id: string;
  submit: string;
  pending: string;
  danger?: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [state, formAction, busy] = useNotifyingAction(action, onDone);
  const { errors, formProps } = useFieldErrors(CODE_FIELD_TEXTS[useLocale()]);
  return (
    <Dialog title={title} onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            {description}
          </p>
          <input type="hidden" name="id" value={id} />
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit={submit} pending={pending} busy={busy} danger={danger} />
        </form>
      )}
    </Dialog>
  );
}
