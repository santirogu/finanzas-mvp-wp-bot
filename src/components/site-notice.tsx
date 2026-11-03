import { cookies } from "next/headers";
import { connection } from "next/server";
import { getLocale } from "@/i18n/server";
import { getCurrentNotice } from "@/modules/notice/current-notice";
import { NOTICE_COOKIE } from "@/modules/notice/notice";
import { NoticeBanner } from "./notice-banner";

/**
 * El aviso para todos, si hay uno vigente y la persona no lo cerró en este navegador. Va dentro de Suspense: se lee
 * en cada pedido (el admin lo publica o lo quita en cualquier momento), nunca al compilar. Por eso el login se arma
 * en cada pedido: la cookie de una sesión vencida la borra el proxy en una redirección (src/proxy.ts).
 */
export async function SiteNotice({ className = "" }: { className?: string }) {
  await connection();
  const notice = await getCurrentNotice(await getLocale());
  if (!notice || (await cookies()).get(NOTICE_COOKIE)?.value === notice.version) return null;
  return (
    <div className={className}>
      <NoticeBanner notice={notice} />
    </div>
  );
}
