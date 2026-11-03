// La autorización para tratar los datos de la persona (Ley 1581 de 2012, art. 9, y Decreto 1377 de 2013, art. 7):
// previa, expresa e informada, y que se pueda probar después. Se da con la casilla del registro o, las cuentas que
// no la tienen (las de antes de pedirla, o si cambia la versión), en PRIVACY_CONSENT_PATH. Queda en la cuenta
// (`user.privacy_version` y `privacy_accepted_at`) y en su historial (`privacy_accepted`).

/**
 * La versión de la política de privacidad que se autoriza. Cámbiala solo si cambia lo que se hace con los datos
 * (qué se guarda, para qué, con quién o por cuánto tiempo): entonces cada cuenta la vuelve a autorizar al entrar y
 * el bot no le registra nada hasta que lo haga. Un arreglo de forma en /privacidad no la cambia.
 */
export const PRIVACY_VERSION = "2026-11-03";

/** Donde una cuenta sin la autorización vigente la da (o cierra sesión, o elimina su cuenta). */
export const PRIVACY_CONSENT_PATH = "/autorizacion";

/** ¿Autorizó la versión vigente? */
export const hasCurrentConsent = (version: string | null | undefined): boolean => version === PRIVACY_VERSION;
