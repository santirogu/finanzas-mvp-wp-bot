// Condiciones SQL comunes de los listados de administración. Sin conexión a la base: las consultas
// que las usan (y validan el rol) están en cada módulo.

import { sql, type AnyColumn, type SQL } from "drizzle-orm";
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
