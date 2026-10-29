import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";

// El tutorial de bienvenida (src/components/welcome-tutorial.tsx): una cuenta nueva lo ve al entrar al Resumen hasta
// que lo termina o lo omite. Las funciones reciben el userId ya validado por el Data Access Layer (src/lib/session.ts).

/** ¿Todavía no lo terminó ni lo omitió? */
export async function isTutorialPending(userId: string): Promise<boolean> {
  const [row] = await db.select({ doneAt: user.tutorialDoneAt }).from(user).where(eq(user.id, userId));
  return row !== undefined && row.doneAt === null;
}

/** Lo da por visto (terminado u omitido). La segunda vez no cambia nada: queda la primera fecha. */
export async function finishTutorial(userId: string): Promise<void> {
  await db
    .update(user)
    .set({ tutorialDoneAt: new Date() })
    .where(and(eq(user.id, userId), isNull(user.tutorialDoneAt)));
}
