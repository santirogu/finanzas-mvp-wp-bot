"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";

/**
 * Último paso al activar la verificación en dos pasos: cierra las demás sesiones de la cuenta.
 * Si alguien había entrado antes con la contraseña (sin el segundo paso), queda afuera.
 */
export async function finishTwoFactorSetupAction(): Promise<void> {
  // Con la verificación ya activa: requireAdmin la exige.
  await requireAdmin();
  await auth.api.revokeOtherSessions({ headers: await headers() });
}
