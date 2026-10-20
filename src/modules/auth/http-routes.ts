// Las rutas HTTP de Better Auth (/api/auth/*) que la app atiende. Todo lo demás responde 404: una
// ruta abierta que la app no usa solo suma superficie de ataque. Por ejemplo, con una sesión robada
// "/verify-password" dejaba averiguar la contraseña sin el bloqueo por intentos.
//
// Lo que la app hace desde el servidor (leer la sesión, cerrarla, verificar la contraseña al
// eliminar la cuenta) llama a auth.api.* directamente: no pasa por estas rutas y sigue funcionando.
// Sin dependencias: las usan src/lib/auth.ts y src/app/api/auth/[...all]/route.ts, y se prueban
// aparte (src/lib/auth-routes.int.test.ts revisa que cada endpoint de Better Auth esté clasificado).

import { TWO_FACTOR_DISABLED_PATHS } from "./two-factor-rules";

export const AUTH_BASE_PATH = "/api/auth";

/** "MÉTODO /ruta" (sin /api/auth) → quién la usa desde el navegador. */
export const AUTH_HTTP_ROUTES = {
  "POST /sign-up/email": "Registro (src/app/[lang]/(auth)/auth-form.tsx)",
  "POST /sign-in/email": "Inicio de sesión (src/app/[lang]/(auth)/auth-form.tsx)",
  "POST /two-factor/enable": "Configurar la verificación en dos pasos (src/app/[lang]/(app)/admin/seguridad/)",
  "POST /two-factor/verify-totp":
    "Código de Google Authenticator: al configurarla y al entrar (two-factor-setup.tsx, two-factor-login.tsx)",
  "POST /two-factor/verify-backup-code": "Código de respaldo al entrar (src/app/[lang]/(auth)/two-factor-login.tsx)",
} as const;

/**
 * Los endpoints de Better Auth sin parámetros que la app no usa por HTTP. Se apagan también dentro de
 * Better Auth (disabledPaths), por si alguien llama a auth.handler sin pasar por el route handler.
 * Los que tienen parámetros (/callback/:id, /reset-password/:token) no se pueden listar aquí: los
 * corta la lista de rutas permitidas.
 */
export const AUTH_DISABLED_PATHS = [
  ...TWO_FACTOR_DISABLED_PATHS,
  // Perfil, contraseña y correo: la app no ofrece cambiarlos.
  "/update-user",
  "/change-password",
  "/verify-password",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
  // Sesiones: se leen y se cierran desde el servidor.
  "/get-session",
  "/update-session",
  "/sign-out",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  // Cuentas sociales y tokens: no hay proveedores configurados.
  "/sign-in/social",
  "/link-social",
  "/list-accounts",
  "/account-info",
  "/unlink-account",
  "/get-access-token",
  "/refresh-token",
  // Verificación de correo y recuperación de contraseña: no se envían correos.
  "/send-verification-email",
  "/verify-email",
  "/request-password-reset",
  "/reset-password",
  // Páginas de prueba y de error de Better Auth.
  "/ok",
  "/error",
] as const;

/** ¿Se atiende este pedido? `pathname` es el de la URL completa (con /api/auth). */
export function isAuthRouteAllowed(method: string, pathname: string): boolean {
  if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) return false;
  return Object.hasOwn(AUTH_HTTP_ROUTES, `${method.toUpperCase()} ${pathname.slice(AUTH_BASE_PATH.length)}`);
}
