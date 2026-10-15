// Condiciones SQL comunes de los listados de administración. Sin conexión a la base: las consultas
// que las usan (y validan el rol) están en cada módulo.

import { inArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { accountEvent } from "@/db/schema";
import { ADMIN_EVENT_TYPES } from "../history/log-filters";
import { ADMIN_TIMEZONE } from "./filters";

/** Medianoche de ese día en Colombia, como instante (para comparar con la columna sin perder el índice). */
const startOfDay = (day: string) => sql`(${day}::date)::timestamp at time zone ${ADMIN_TIMEZONE}`;

/** Que la fecha de `column` caiga entre esos días de Colombia (los dos incluidos; null: sin límite). */
export function inDayRange(column: AnyColumn, { from, to }: { from: string | null; to: string | null }): SQL[] {
  const conditions: SQL[] = [];
  if (from) conditions.push(sql`${column} >= ${startOfDay(from)}`);
  if (to) conditions.push(sql`${column} < ${startOfDay(to)} + interval '1 day'`);
  return conditions;
}

/** Los eventos que son acciones del admin: sus tipos propios y la desvinculación que hizo él (aunque ya no exista su cuenta). */
export const isAdminActionSql = (): SQL =>
  or(inArray(accountEvent.type, [...ADMIN_EVENT_TYPES]), sql`${accountEvent.details}->>'reason' = 'by_admin'`)!;
