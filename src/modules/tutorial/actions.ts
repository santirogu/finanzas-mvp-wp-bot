"use server";

import { requireUser } from "@/lib/session";
import { finishTutorial } from "./tutorial";

/**
 * Al cerrar el tutorial de bienvenida (con Empezar, Omitir, Esc o el enlace a Mi cuenta): no vuelve a salir. El
 * dueño sale de la sesión.
 */
export async function finishTutorialAction(): Promise<void> {
  const user = await requireUser();
  await finishTutorial(user.id);
}
