"use client";

import { useSearchParams } from "next/navigation";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { EXPIRED_SESSION_PARAM } from "@/lib/expired-session";

const TEXTS = texts(
  { expired: "Tu sesión se cerró. Vuelve a iniciar sesión." },
  { en: { expired: "Your session ended. Sign in again." } },
);

/** Aviso en el login cuando la sesión se cerró en otro lado (src/lib/expired-session.ts). */
export function ExpiredSessionNotice() {
  const t = useTexts(TEXTS);
  const expired = useSearchParams().get(EXPIRED_SESSION_PARAM.name) === EXPIRED_SESSION_PARAM.value;
  if (!expired) return null;
  return (
    <p role="status" className="w-full max-w-sm rounded-lg bg-brand/10 px-3 py-2 text-sm">
      {t.expired}
    </p>
  );
}
