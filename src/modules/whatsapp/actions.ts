"use server";

import { refresh } from "next/cache";
import { getRequestLocale } from "@/i18n/request";
import { requireUser } from "@/lib/session";
import { createLinkCode, LinkCodeLimitError, unlinkUser } from "./link";

export type LinkCodeState = { ok: true; code: string; expiresAt: string } | { ok: false; error: string };

export async function generateLinkCodeAction(): Promise<LinkCodeState> {
  const user = await requireUser();
  try {
    const { code, expiresAt } = await createLinkCode(user.id);
    return { ok: true, code, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    if (error instanceof LinkCodeLimitError) {
      // El mensaje del error va en español; en inglés, el propio.
      const english = "You already got several codes in the last hour. Use the last one or wait a while to get another.";
      return { ok: false, error: (await getRequestLocale()) === "es" ? error.message : english };
    }
    throw error;
  }
}

export async function unlinkWhatsAppAction() {
  const user = await requireUser();
  await unlinkUser(user.id);
  refresh();
}
