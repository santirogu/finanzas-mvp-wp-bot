import { getLocale } from "@/i18n/server";

/**
 * La política de privacidad y "Eliminar tus datos" están solo en español (decisión del dueño): sus páginas
 * van con `lang="es"` (así el lector de pantalla las lee con la voz en español) y, con la app en inglés,
 * esta nota arriba lo dice.
 */
export async function SpanishOnlyNote() {
  if ((await getLocale()) === "es") return null;
  return (
    <p lang="en" className="mt-4 rounded-lg bg-brand/10 px-3 py-2 text-sm">
      This page is only available in Spanish.
    </p>
  );
}
