// Roles de la app. Sin dependencias: lo usan el esquema de la base, el servidor y los comandos
// de terminal.
//
//   user  → toda cuenta al registrarse: Resumen, Ingresos, Egresos y Mi cuenta.
//   admin → todo lo de "user" y además la sección de administración. Solo se da desde la
//           terminal (pnpm admin:grant), nunca desde la app.

export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Nombre de cada rol para mostrar en la app. */
export const ROLE_LABELS: Record<Role, string> = {
  user: "Usuario",
  admin: "Administrador",
};

/** Lo que incluye cada rol: un admin también es usuario. */
const INCLUDES: Record<Role, readonly Role[]> = {
  user: ["user"],
  admin: ["admin", "user"],
};

/** Convierte lo que venga de la sesión o de la base en un rol. Ante cualquier duda: "user". */
export function parseRole(value: unknown): Role {
  return value === "admin" ? "admin" : "user";
}

/** ¿Quien tiene `role` puede hacer lo que exige `required`? */
export function hasRole(role: Role, required: Role): boolean {
  return INCLUDES[role].includes(required);
}
