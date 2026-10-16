"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/session";
import { createLinkCode, LinkCodeLimitError, unlinkUser } from "./link";

export type LinkCodeState = { ok: true; code: string; expiresAt: string } | { ok: false; error: string };

export async function generateLinkCodeAction(): Promise<LinkCodeState> {
  const user = await requireUser();
  try {
    const { code, expiresAt } = await createLinkCode(user.id);
    return { ok: true, code, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    if (error instanceof LinkCodeLimitError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function unlinkWhatsAppAction() {
  const user = await requireUser();
  await unlinkUser(user.id);
  refresh();
}
