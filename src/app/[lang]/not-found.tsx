import { getDictionary } from "@/i18n/server";
import { NotFoundContent } from "./not-found-content";

// Para direcciones que no existen ([...rest]/page.tsx, que pone el título) y para notFound() (por ejemplo,
// un movimiento ajeno). Next no toma el título de aquí: el layout raíz está dentro de [lang].
export default async function NotFound() {
  return <NotFoundContent text={(await getDictionary()).notFound} />;
}
