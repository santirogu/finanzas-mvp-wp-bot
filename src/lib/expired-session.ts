// Sesión vencida o cerrada en otro lado (otro dispositivo, al activar la verificación en dos pasos,
// pnpm admin:reset-2fa, una cuenta borrada): el navegador conserva la cookie, pero ya no sirve.
//
// El proxy solo mira si la cookie existe (src/proxy.ts), así que mandaría /login al dashboard y el
// dashboard, que sí valida la sesión, de vuelta al login: un círculo sin fin. Por eso requireUser
// manda a EXPIRED_SESSION_LOGIN y ahí el proxy borra la cookie vieja y deja ver el login.

export const EXPIRED_SESSION_PARAM = { name: "sesion", value: "vencida" } as const;
export const EXPIRED_SESSION_LOGIN = `/login?${EXPIRED_SESSION_PARAM.name}=${EXPIRED_SESSION_PARAM.value}`;

/** Cookies de sesión de Better Auth (en producción, con https, llevan el prefijo __Secure-). */
export const SESSION_COOKIE_NAMES = ["session_token", "session_data", "dont_remember"].flatMap((name) => [
  `better-auth.${name}`,
  `__Secure-better-auth.${name}`,
]);
