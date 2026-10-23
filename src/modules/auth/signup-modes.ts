// Quién puede crear una cuenta (Configuración del admin, /admin/configuracion): cualquiera, nadie o solo los
// correos invitados. Sin dependencias: lo usan el servidor (src/modules/auth/signup-policy.ts), la página de
// registro y la del admin. En el orden en que se muestran: de más abierto a más cerrado.

export const SIGNUP_MODES = ["open", "invite", "closed"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

/** El de siempre, mientras el admin no elija otro. */
export const DEFAULT_SIGNUP_MODE: SignupMode = "open";

export const isSignupMode = (value: unknown): value is SignupMode => SIGNUP_MODES.includes(value as SignupMode);
