"use client";

import { useId } from "react";
import type { DialogState } from "@/components/dialog";
import { FieldError } from "@/components/field-error";
import { TOTP_CODE_MESSAGES, type FieldMessages } from "@/lib/field-errors";

// Las piezas de las ventanas de confirmación de la administración (Usuarios, Categorías): la ventana
// modal, el campo del código de Google Authenticator, los errores y los botones. El estado de cada
// formulario viene de su Server Action ({ error, field, message }).

// La ventana, sus errores y sus botones son de toda la app (src/components/dialog.tsx); aquí se vuelven a
// exportar para las ventanas de la administración.
export { Buttons, Dialog, type DialogState, FormError, openAsModal } from "@/components/dialog";

/** Los mensajes del campo del código antes de enviar, para useFieldErrors de cada ventana. */
export const CODE_FIELD_MESSAGES: Record<string, FieldMessages> = { code: TOTP_CODE_MESSAGES };

/**
 * El campo del código de Google Authenticator. Muestra el error del navegador (`clientError`, antes
 * de enviar) o, si no hay, el del servidor (un código equivocado).
 */
export function CodeField({ state, clientError }: { state: DialogState; clientError?: string }) {
  const errorId = useId();
  const message = clientError ?? (state.field === "code" ? state.error : undefined);
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Código de Google Authenticator</span>
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\s*(\d\s*){6}"
          maxLength={7}
          placeholder="000000"
          aria-invalid={Boolean(message) || undefined}
          aria-describedby={message ? errorId : undefined}
          className="input font-mono tracking-[0.3em]"
        />
      </label>
      <FieldError id={errorId} message={message} />
    </div>
  );
}
