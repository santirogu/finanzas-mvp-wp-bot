import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
