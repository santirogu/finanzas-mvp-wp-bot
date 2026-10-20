import Link from "next/link";
import { texts } from "@/i18n/texts";

export const NOT_FOUND_TEXTS = texts(
  {
    title: "Página no encontrada",
    eyebrow: "Error 404",
    heading: "No encontramos esta página",
    body: "Puede que el enlace esté mal escrito o que lo que buscabas ya no exista.",
    back: "Volver al inicio",
  },
  {
    en: {
      title: "Page not found",
      eyebrow: "Error 404",
      heading: "We couldn't find this page",
      body: "The link may be mistyped, or what you were looking for may no longer exist.",
      back: "Back to home",
    },
  },
);

/**
 * La 404: la de las páginas (not-found.tsx, en el idioma de la página) y la de las direcciones fuera de
 * ellas, como una ruta de la API que no existe (src/app/global-not-found.tsx). "/" lleva al dashboard si
 * hay sesión y a la portada si no (src/proxy.ts), así que sirve en los dos casos.
 */
export function NotFoundContent({ text }: { text: (typeof NOT_FOUND_TEXTS)["es"] }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium text-brand">{text.eyebrow}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{text.heading}</h1>
      <p className="mt-3 text-muted">{text.body}</p>
      <div className="mt-8 flex justify-center">
        <Link href="/" className="btn-primary">
          {text.back}
        </Link>
      </div>
    </main>
  );
}
