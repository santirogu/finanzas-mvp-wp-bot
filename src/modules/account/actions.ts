"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ACCOUNT_LOCKED } from "@/lib/auth-errors";
import { requireUser } from "@/lib/session";
import { lockedUntil, normalizeEmail, recordFailure } from "@/modules/auth/lockout";
import { CONFIRMATION_WORD } from "./confirmation";
import { deleteAccountData } from "./delete-account";

export type DeleteAccountState = {
  error?: string;
  fieldErrors?: Partial<Record<"password" | "confirmation", string>>;
};

/**
 * Elimina la cuenta de quien tiene la sesión y todos sus datos. Pide la contraseña (aunque haya
 * sesión: alguien podría usar un celular desbloqueado ajeno) y escribir la palabra de
 * confirmación. Las contraseñas equivocadas cuentan para el bloqueo por intentos fallidos.
 */
export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim().toUpperCase();

  const fieldErrors: DeleteAccountState["fieldErrors"] = {};
  if (!password) fieldErrors.password = "Escribe tu contraseña";
  if (confirmation !== CONFIRMATION_WORD) {
    fieldErrors.confirmation = `Escribe ${CONFIRMATION_WORD} para confirmar`;
  }
  if (fieldErrors.password || fieldErrors.confirmation) return { fieldErrors };

  const email = normalizeEmail(user.email);
  if (await lockedUntil(email)) return { error: ACCOUNT_LOCKED };

  const requestHeaders = await headers();
  try {
    await auth.api.verifyPassword({ body: { password }, headers: requestHeaders });
  } catch (error) {
    if (!isAPIError(error)) throw error;
    if (error.body?.code !== "INVALID_PASSWORD") {
      return { error: "No pudimos verificar tu contraseña. Cierra sesión y vuelve a entrar." };
    }
    await recordFailure(email);
    return { fieldErrors: { password: "Contraseña incorrecta" } };
  }

  // Primero se cierra la sesión (borra la cookie) y después se borra todo.
  await auth.api.signOut({ headers: requestHeaders });
  await deleteAccountData(user.id);
  redirect("/cuenta-eliminada");
}
