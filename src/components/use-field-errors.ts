"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { fieldErrorMessage, type FieldMessages } from "@/lib/field-errors";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Lo que dice el navegador del campo (un select no tiene largo mínimo ni máximo). */
const stateOf = (field: Field) => ({
  validity: field.validity,
  type: field.type,
  value: field.value,
  minLength: "minLength" in field ? field.minLength : -1,
  maxLength: "maxLength" in field ? field.maxLength : -1,
});

/**
 * Los errores de los campos de un formulario, en español y debajo de cada campo, en vez del globo
 * del navegador. Uso: `<form {...formProps}>` y `errors.nombre` junto a cada campo (con
 * aria-invalid y aria-describedby). Se marcan todos los campos con problemas a la vez, el cursor va
 * al primero y el mensaje se borra apenas se corrige. Es solo el aviso: el servidor valida igual.
 *
 * La prueba src/forms.test.ts exige que todo formulario con campos validados lo use.
 */
export function useFieldErrors(messages: Record<string, FieldMessages> = {}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  // El primero de cada intento de envío recibe el cursor (el navegador avisa campo por campo).
  const focusedThisTry = useRef(false);

  const onInvalidCapture = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const field = event.target as Field;
      // Sin el globo del navegador (que sale en su idioma).
      event.preventDefault();
      const message = fieldErrorMessage(stateOf(field), messages[field.name]);
      if (message) setErrors((current) => ({ ...current, [field.name]: message }));
      if (!focusedThisTry.current) {
        focusedThisTry.current = true;
        field.focus();
        setTimeout(() => (focusedThisTry.current = false));
      }
    },
    [messages],
  );

  // Apenas el campo queda bien, se va su mensaje (y si cambia de problema, se actualiza).
  const recheck = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const field = event.target as Field;
      // Solo los campos con nombre (los demás no tienen mensaje).
      if (!field.name) return;
      setErrors((current) => {
        if (!(field.name in current)) return current;
        const message = fieldErrorMessage(stateOf(field), messages[field.name]);
        if (message === current[field.name]) return current;
        const next = { ...current };
        if (message) next[field.name] = message;
        else delete next[field.name];
        return next;
      });
    },
    [messages],
  );

  /** Borra todos los mensajes (p. ej. al cambiar lo que pide el formulario). */
  const reset = useCallback(() => setErrors({}), []);

  return { errors, reset, formProps: { onInvalidCapture, onInput: recheck, onChange: recheck } };
}
