// Los textos en español: el idioma de referencia. Los demás idiomas tienen las mismas claves (el tipo
// `Dictionary` lo exige al compilar). Un texto con datos es una función que los recibe.

export const es = {
  meta: {
    title: "Finanzas",
    description: "Registra tus ingresos y egresos, también desde WhatsApp.",
  },
  notFound: {
    title: "Página no encontrada",
    eyebrow: "Error 404",
    heading: "No encontramos esta página",
    body: "Puede que el enlace esté mal escrito o que lo que buscabas ya no exista.",
    back: "Volver al inicio",
  },
};

export type Dictionary = typeof es;
