"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CATEGORY_NAME_MAX, CATEGORY_TYPE_LABELS, DEFAULT_CATEGORY, EMOJI_SUGGESTIONS, type CategoryType } from "@/modules/admin/categories/category-input";
import { describedBy } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import type { FieldMessages } from "@/lib/field-errors";
import { Buttons, CODE_FIELD_MESSAGES, CodeField, Dialog, DoneMessage, FormError } from "../admin-dialog";
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
// El servidor vuelve a validar todo.

export type ManagedCategory = {
  id: string;
  name: string;
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

const movementsLabel = (n: number) => (n === 0 ? "Sin movimientos" : `${n} ${n === 1 ? "movimiento" : "movimientos"}`);

// El error del nombre antes de enviar, en español (en vez del globo del navegador).
const CATEGORY_MESSAGES: Record<string, FieldMessages> = { name: { required: "Escribe un nombre." } };

export function CategoryManager({ type, categories }: { type: CategoryType; categories: ManagedCategory[] }) {
  const [open, setOpen] = useState<Open>(null);
  const [done, setDone] = useState<string | null>(null);
  const kind = CATEGORY_TYPE_LABELS[type].toLowerCase();
  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);
  const fallbackEmoji = categories.find((c) => c.isDefault)?.emoji ?? "📦";
  const start = (next: Open) => {
    setDone(null);
    setOpen(next);
  };
  const close = () => setOpen(null);
  const finish = (message: string) => {
    setDone(message);
    setOpen(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Se aplican de inmediato en los formularios y en el bot.</p>
        <button type="button" onClick={() => start({ kind: "create" })} className="btn-primary shrink-0">
          Nueva categoría
        </button>
      </div>
      {done && <DoneMessage message={done} />}

      <ul aria-label={`Categorías de ${kind}`} className="divide-y divide-border">
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
                  { label: "Archivar", onClick: () => start({ kind: "archive", category }) },
                  { label: "Eliminar", danger: true, onClick: () => start({ kind: "delete", category }) },
                ]}
              />
            )}
          </CategoryRow>
        ))}
      </ul>

      {archived.length > 0 && (
        <section aria-labelledby={`archivadas-${type}`} className="space-y-1 pt-2">
          <h3 id={`archivadas-${type}`} className="text-sm font-medium text-muted">
            Archivadas
          </h3>
          <p className="text-xs text-muted">No aparecen en los formularios ni las usa el bot; sus movimientos las conservan.</p>
          <ul aria-label={`Categorías archivadas de ${kind}`} className="divide-y divide-border">
            {archived.map((category) => (
              <CategoryRow key={category.id} category={category}>
                <RestoreButton category={category} onDone={finish} />
                <MoreActions name={category.name} actions={[{ label: "Eliminar", danger: true, onClick: () => start({ kind: "delete", category }) }]} />
              </CategoryRow>
            ))}
          </ul>
        </section>
      )}

      {open?.kind === "create" && <CategoryFormDialog type={type} onClose={close} onDone={finish} />}
      {open?.kind === "edit" && <CategoryFormDialog type={type} category={open.category} onClose={close} onDone={finish} />}
      {open?.kind === "archive" && (
        <CodeDialog
          title={`¿Archivar la categoría ${open.category.name}?`}
          action={archiveCategoryAction}
          id={open.category.id}
          submit="Archivar"
          pending="Archivando…"
          onClose={close}
          onDone={finish}
          description={
            <>
              Dejará de aparecer en los formularios y el bot no la usará.{" "}
              {open.category.movements === 0
                ? "No tiene movimientos."
                : open.category.movements === 1
                  ? "El movimiento que ya la tiene la conserva."
                  : `Los ${open.category.movements} movimientos que ya la tienen la conservan.`}{" "}
              Puedes restaurarla cuando quieras.
            </>
          }
        />
      )}
      {open?.kind === "delete" && (
        <CodeDialog
          title={`¿Eliminar la categoría ${open.category.name}?`}
          action={deleteCategoryAction}
          id={open.category.id}
          submit={open.category.movements > 0 ? `Eliminar y pasar a ${DEFAULT_CATEGORY}` : "Eliminar"}
          pending="Eliminando…"
          danger
          onClose={close}
          onDone={finish}
          description={
            open.category.movements > 0 ? (
              <>
                <span className="block rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
                  Tiene {movementsLabel(open.category.movements)}. Si la eliminas, pasarán a {fallbackEmoji} {DEFAULT_CATEGORY}. La
                  eliminación queda en el registro de cambios y no se puede deshacer.
                </span>
                {/* El espacio separa las dos frases para los lectores de pantalla (los bloques no lo ponen). */}
                {!open.category.archived && (
                  <>
                    {" "}
                    <span className="mt-2 block">Si solo quieres que no se use más, archívala: los movimientos la conservan.</span>
                  </>
                )}
              </>
            ) : (
              "No tiene movimientos. La eliminación queda en el registro de cambios y no se puede deshacer."
            )
          }
        />
      )}
    </div>
  );
}

function CategoryRow({ category, onEdit, children }: { category: ManagedCategory; onEdit?: () => void; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span aria-hidden className={`flex size-9 flex-none items-center justify-center rounded-lg bg-chip text-lg ${category.archived ? "grayscale" : ""}`}>
        {category.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`flex flex-wrap items-center gap-2 text-sm font-medium ${category.archived ? "text-muted" : ""}`}>
          <span className="break-words">{category.name}</span>
          {category.isDefault && <span className="rounded-full border border-border px-2 text-xs font-normal text-muted">Por defecto</span>}
        </p>
        <p className="text-xs text-muted">
          {movementsLabel(category.movements)}
          {category.isDefault && " · solo se cambia el emoji"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar ${category.name}`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background"
          >
            Editar
          </button>
        )}
        {children}
      </div>
    </li>
  );
}

/** El botón "⋯": muestra las acciones que piden el código (un desplegable simple, no un menú). */
function MoreActions({ name, actions }: { name: string; actions: { label: string; danger?: boolean; onClick: () => void }[] }) {
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
        aria-label={`Más acciones para ${name}`}
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
            <span className="block text-xs text-muted">Pide el código</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Restaurar no pide código: solo deshace un archivado. */
function RestoreButton({ category, onDone }: { category: ManagedCategory; onDone: (message: string) => void }) {
  const [state, formAction, busy] = useNotifyingAction(restoreCategoryAction, onDone);
  return (
    <form action={formAction} className="flex flex-col items-end">
      <input type="hidden" name="id" value={category.id} />
      <button
        type="submit"
        disabled={busy}
        aria-label={`Restaurar ${category.name}`}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-60"
      >
        {busy ? "Restaurando…" : "Restaurar"}
      </button>
      {state.error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Con éxito, la ventana se cierra y la lista muestra el aviso (la página se vuelve a dibujar). */
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
  const editing = Boolean(category);
  const [state, formAction, busy] = useNotifyingAction(editing ? updateCategoryAction : createCategoryAction, onDone);
  const { errors, formProps } = useFieldErrors(CATEGORY_MESSAGES);
  // El del navegador (antes de enviar) o el del servidor (un nombre repetido, p. ej.).
  const nameMessage = errors.name ?? (state.field === "name" ? state.error : undefined);
  const [emoji, setEmoji] = useState(category?.emoji ?? "");
  const nameError = useId();
  const emojiError = useId();
  const emojiHelp = useId();
  const kind = CATEGORY_TYPE_LABELS[type].toLowerCase();

  return (
    <Dialog title={category ? `Editar la categoría ${category.name}` : `Nueva categoría de ${kind}`} onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            {CATEGORY_TYPE_LABELS[type]} · se aplica de inmediato en los formularios y en el bot.
            {category && category.movements > 0 && " Los movimientos que ya la usan pasan a verse con el nombre nuevo."}
          </p>
          {category ? <input type="hidden" name="id" value={category.id} /> : <input type="hidden" name="type" value={type} />}
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Nombre</span>
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
            {category?.isDefault && <p className="text-xs text-muted">A &quot;{DEFAULT_CATEGORY}&quot; solo se le puede cambiar el emoji.</p>}
            {nameMessage && (
              <p id={nameError} className="text-xs text-danger">
                {nameMessage}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium">
                Emoji <span className="font-normal text-muted">(opcional)</span>
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
              Toca uno de los sugeridos o escribe otro. Si lo dejas vacío, la categoría se mostrará con un punto (•).
            </p>
            <div role="group" aria-label="Emojis sugeridos" className="flex flex-wrap gap-1">
              {EMOJI_SUGGESTIONS[type].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  aria-label={`Usar ${suggestion}`}
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
          <Buttons submit={editing ? "Guardar" : "Crear"} pending={editing ? "Guardando…" : "Creando…"} busy={busy} />
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
  const { errors, formProps } = useFieldErrors(CODE_FIELD_MESSAGES);
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
