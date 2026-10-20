import type { Locale } from "@/i18n/locales";

// El idioma de quien hace el pedido en las Server Actions (src/i18n/request.ts, que en la app lee la cookie
// `idioma`): setup.ts lo simula con este valor, que vuelve a español antes de cada prueba. Una prueba en
// inglés pone `requestLocale.value = "en"`.
export const requestLocale: { value: Locale } = { value: "es" };
