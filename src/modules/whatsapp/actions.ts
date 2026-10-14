"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/session";
import { createLinkCode, unlinkUser } from "./link";

export async function generateLinkCodeAction() {
  const user = await requireUser();
  const { code, expiresAt } = await createLinkCode(user.id);
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function unlinkWhatsAppAction() {
  const user = await requireUser();
  await unlinkUser(user.id);
  refresh();
}
