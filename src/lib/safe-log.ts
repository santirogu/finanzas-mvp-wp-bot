// Lo que se escribe en los logs (Vercel) sobre un error: su tipo y su código, nunca su mensaje. El
// mensaje de un error de la base trae los parámetros de la consulta (teléfonos, textos de mensajes,
// montos; en Better Auth, hasta el hash de la contraseña), y los logs no deben guardar datos
// personales (auditoría de seguridad 2026-10-15).

type MaybeWithCode = { code?: unknown; cause?: unknown } | null | undefined;

const codeOf = (value: unknown): string | undefined => {
  const code = (value as MaybeWithCode)?.code;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
};

/** "DrizzleQueryError (22021)", "TypeError" o "error desconocido": sin el mensaje del error. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "error desconocido";
  // El código de Postgres viene en el error o en su causa (drizzle envuelve el de postgres.js).
  const code = codeOf(error) ?? codeOf((error as { cause?: unknown }).cause);
  return code ? `${error.name} (${code})` : error.name;
}

type AuthLogLevel = "debug" | "info" | "warn" | "error";

/**
 * El logger de Better Auth (opción `logger.log` en src/lib/auth.ts), sin datos personales: su
 * mensaje sin los parámetros de la consulta, y de los argumentos solo el tipo de los errores.
 */
export function logAuthSafely(level: AuthLogLevel, message: string, ...args: unknown[]): void {
  const text = `[auth] ${String(message).split("\nparams:")[0].slice(0, 300)}`;
  const errors = args.filter((arg) => arg instanceof Error).map(describeError);
  const write = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  write(text, ...errors);
}
