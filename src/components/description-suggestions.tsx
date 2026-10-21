"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { matchSuggestions } from "@/lib/suggestions";

const TEXTS = texts({ label: "Descripciones que ya usaste" }, { en: { label: "Descriptions you've used" } });

// Las sugerencias del campo de descripción (el formulario de movimientos): una lista con el diseño de
// la app debajo del campo, en vez de la del navegador (que cada sistema dibuja a su manera y pinta el
// campo de azul al elegir). Es el patrón "combobox" de ARIA: el foco se queda en el campo, las flechas
// recorren la lista (aria-activedescendant), Enter elige y Escape la cierra.

export type Suggestion = { description: string; categoryId: string | null };
type CategoryLabel = { id: string; name: string; emoji: string };

export function useDescriptionSuggestions({
  suggestions,
  categories,
  onPick,
}: {
  suggestions: Suggestion[];
  /** Para mostrar, a la derecha de cada sugerencia, su categoría de la última vez. */
  categories: CategoryLabel[];
  /** Al elegir una (con el dedo, el mouse o Enter): el campo ya tiene su texto. */
  onPick: (suggestion: Suggestion) => void;
}) {
  const t = useTexts(TEXTS);
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement | null>(null);
  // Al salir del campo, la lista se cierra un instante después: si se salió para tocar una sugerencia
  // (en el celular el campo puede perder el foco antes del toque), alcanza a elegirse.
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(closing.current), []);
  const matches = useMemo(() => matchSuggestions(typed, suggestions), [typed, suggestions]);
  const shown = open && matches.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  // La opción marcada con las flechas, siempre a la vista.
  useEffect(() => {
    if (active >= 0) list.current?.querySelector(`[id="${optionId(active)}"]`)?.scrollIntoView?.({ block: "nearest" });
  });

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);
  /** Después de registrar: el campo vuelve a empezar vacío. */
  const reset = useCallback(() => {
    setTyped("");
    close();
  }, [close]);

  // Abierta, si el foco entra a otro elemento (aunque antes saliera sin destino), se cierra en el acto:
  // no tapa el campo que lo recibe.
  useEffect(() => {
    if (!shown) return;
    const onFocusIn = (event: FocusEvent) => {
      if (event.target !== input.current) close();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [shown, close]);

  function pick(field: HTMLInputElement, suggestion: Suggestion) {
    clearTimeout(closing.current);
    field.value = suggestion.description;
    setTyped(suggestion.description);
    close();
    onPick(suggestion);
  }

  if (suggestions.length === 0) return { inputProps: {}, popup: null, reset };

  const inputProps = {
    role: "combobox",
    "aria-autocomplete": "list" as const,
    "aria-expanded": shown,
    "aria-controls": listId,
    "aria-activedescendant": shown && active >= 0 ? optionId(active) : undefined,
    // Sin el historial del navegador encima de la lista.
    autoComplete: "off",
    onFocus: (event: { currentTarget: HTMLInputElement }) => {
      input.current = event.currentTarget;
      clearTimeout(closing.current);
    },
    onInput: (event: { currentTarget: HTMLInputElement }) => {
      input.current = event.currentTarget;
      setTyped(event.currentTarget.value);
      setOpen(true);
      setActive(-1);
    },
    onBlur: (event: { relatedTarget: EventTarget | null }) => {
      // Hacia otro campo (Tab, un clic en él), se cierra ya: si no, por un instante taparía el campo
      // que recibe el foco. Sin destino (un toque en una sugerencia), un instante después.
      if (event.relatedTarget) close();
      else closing.current = setTimeout(close, 150);
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      const field = event.currentTarget;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (matches.length === 0) return;
        event.preventDefault();
        setOpen(true);
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((current) => (current + step + matches.length + (current < 0 && step < 0 ? 1 : 0)) % matches.length);
      } else if (event.key === "Enter" && shown && active >= 0) {
        // Elige la marcada (no envía el formulario).
        event.preventDefault();
        pick(field, matches[active].item);
      } else if (event.key === "Escape" && shown) {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        close();
      }
    },
  };

  const popup = (
    <ul
      ref={list}
      id={listId}
      role="listbox"
      aria-label={t.label}
      hidden={!shown}
      className="card absolute inset-x-0 top-1 z-20 max-h-72 overflow-y-auto p-1 shadow-lg"
    >
      {matches.map(({ item, start, end }, i) => {
        const category = categories.find((c) => c.id === item.categoryId);
        return (
          <li
            key={item.description}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            onMouseDown={(event) => {
              // El campo conserva el foco (en el celular, el teclado sigue abierto). En mousedown y no en
              // pointerdown: Safari (iPhone, iPad) no manda el click de un toque cuyo pointerdown se canceló,
              // y elegir no hacía nada.
              event.preventDefault();
            }}
            onClick={() => {
              if (!input.current) return;
              pick(input.current, item);
              input.current.focus();
            }}
            onPointerEnter={(event) => {
              // Solo con el mouse: con el dedo no hay "pasar por encima", y en Safari un cambio al tocar
              // puede tomarse como un hover y comerse el toque.
              if (event.pointerType === "mouse") setActive(i);
            }}
            className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 text-sm pointer-fine:min-h-9 ${i === active ? "bg-background" : ""}`}
          >
            <span className="min-w-0 truncate">
              {item.description.slice(0, start)}
              <span className="font-semibold">{item.description.slice(start, end)}</span>
              {item.description.slice(end)}
            </span>
            {category && (
              <span className="shrink-0 text-xs text-muted">
                {category.emoji} {category.name}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );

  return { inputProps, popup, reset };
}
