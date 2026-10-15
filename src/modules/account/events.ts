import "server-only";
import { db } from "@/db";
import { accountEvent, type AccountEventDetails } from "@/db/schema";

// Historial de cada cuenta (tabla account_event): registro y vinculación de WhatsApp, y lo que el
// admin hizo con ella. Lo ve el admin en /admin. Cada función que cambia algo de eso registra su
// evento en la misma transacción.

export type AccountEventType = (typeof accountEvent.$inferInsert)["type"];

type Executor = Pick<typeof db, "insert">;

export type NewAccountEvent = {
  type: AccountEventType;
  /** null en un intento de vinculación con un código inválido: no se sabe de qué cuenta era. */
  userId: string | null;
  phone?: string | null;
  details?: AccountEventDetails;
  /** El admin que lo hizo (acciones del admin en /admin/usuarios). */
  adminId?: string | null;
};

/** Registra eventos; con `tx`, dentro de esa transacción (se guardan o se pierden con el cambio). */
export async function recordEvents(events: NewAccountEvent[], tx: Executor = db): Promise<void> {
  if (events.length === 0) return;
  await tx.insert(accountEvent).values(
    events.map(({ type, userId, phone = null, details = {}, adminId = null }) => ({ type, userId, phone, details, adminId })),
  );
}

export const recordEvent = (event: NewAccountEvent, tx?: Executor) => recordEvents([event], tx);
