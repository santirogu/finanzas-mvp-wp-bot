"use client";

import { useSearchParams } from "next/navigation";
import { EXPIRED_SESSION_PARAM } from "@/lib/expired-session";

/** Aviso en el login cuando la sesión se cerró en otro lado (src/lib/expired-session.ts). */
export function ExpiredSessionNotice() {
  const expired = useSearchParams().get(EXPIRED_SESSION_PARAM.name) === EXPIRED_SESSION_PARAM.value;
  if (!expired) return null;
  return (
    <p role="status" className="w-full max-w-sm rounded-lg bg-brand/10 px-3 py-2 text-sm">
      Tu sesión se cerró. Vuelve a iniciar sesión.
    </p>
  );
}
