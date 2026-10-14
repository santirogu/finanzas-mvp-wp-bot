import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chat } from "./chat";

export const metadata: Metadata = { title: "Simulador de WhatsApp" };

export default function SimulatorPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted">Solo en desarrollo</p>
        <h1 className="text-2xl font-semibold tracking-tight">Simulador de WhatsApp</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Los mensajes pasan por el mismo flujo que el webhook real: vinculación, comandos,
          interpretación con Claude y registro en tu cuenta. Las respuestas se muestran aquí en vez
          de enviarse por WhatsApp.
        </p>
      </div>
      <Chat />
    </div>
  );
}
