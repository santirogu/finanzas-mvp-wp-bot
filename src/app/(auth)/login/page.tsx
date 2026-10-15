import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../auth-form";
import { ExpiredSessionNotice } from "./expired-session-notice";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* La URL se lee en cada request (Cache Components): mientras tanto, sin aviso. */}
      <Suspense fallback={null}>
        <ExpiredSessionNotice />
      </Suspense>
      <AuthForm mode="login" />
    </div>
  );
}
