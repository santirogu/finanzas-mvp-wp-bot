import Link from "next/link";
import { Logo } from "@/components/logo";

// Entrar, crear la cuenta y los dos pasos del admin: el formulario al centro y, arriba, el logo, que
// lleva al inicio.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
      <Link href="/" className="text-xl">
        <Logo markClassName="size-8" />
      </Link>
      {children}
    </main>
  );
}
