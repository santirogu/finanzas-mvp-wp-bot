import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, loginFailure, session, user, whatsappLink } from "@/db/schema";
import { createUser } from "../../../../../../test/integration/factories";
import { createAdminWithTwoFactor } from "../../../../../../test/integration/two-factor";

// Las Server Actions de las acciones del admin, con la capa de datos y la base de verdad. Se simulan
// la sesión, refresh() y redirect(): aquí se prueba que validan el rol antes que nada, que leen bien
// el formulario y qué devuelven o hacen en cada caso.
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const {
  deleteAccountByAdminAction,
  reactivateAccountAction,
  revokeSessionsAction,
  suspendAccountAction,
  unlinkWhatsAppByAdminAction,
  unlockLoginAction,
} = await import("./actions");

async function seed() {
  const { admin, codeAt } = await createAdminWithTwoFactor();
  mocks.requireAdmin.mockResolvedValue({ id: admin.id, role: "admin", twoFactorEnabled: true });
  const ana = await createUser({ name: "Ana Pérez", email: "ana@correo.com" });
  await db.insert(whatsappLink).values({ userId: ana.id, phone: "573001112233" });
  await db.insert(loginFailure).values({
    email: ana.email,
    failures: 5,
    firstFailureAt: new Date(),
    lockedUntil: new Date(Date.now() + 10 * 60_000),
  });
  await db.insert(session).values({ id: randomUUID(), token: randomUUID(), userId: ana.id, expiresAt: new Date(Date.now() + 86_400_000) });
  return { ana, code: () => codeAt(new Date()) };
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => {
  mocks.requireAdmin.mockReset();
  mocks.refresh.mockReset();
  mocks.redirect.mockClear();
});

describe("con éxito", () => {
  it.each([
    ["unlockLoginAction", unlockLoginAction, "Se desbloqueó el inicio de sesión de Ana Pérez.", "login_unlocked"],
    ["revokeSessionsAction", revokeSessionsAction, "Se cerró la sesión de Ana Pérez.", "sessions_revoked"],
    ["unlinkWhatsAppByAdminAction", unlinkWhatsAppByAdminAction, "Se desvinculó el WhatsApp de Ana Pérez.", "whatsapp_unlinked"],
    ["suspendAccountAction", suspendAccountAction, "Se suspendió la cuenta de Ana Pérez.", "account_suspended"],
  ] as const)("%s avisa qué pasó y vuelve a dibujar la página", async (_, action, message, type) => {
    const { ana, code } = await seed();
    expect(await action({}, form({ userId: ana.id, code: code() }))).toEqual({ message });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(await db.select({ type: accountEvent.type }).from(accountEvent).where(eq(accountEvent.userId, ana.id))).toEqual([{ type }]);
  });

  it("suspendAccountAction guarda el motivo del formulario", async () => {
    const { ana, code } = await seed();
    await suspendAccountAction({}, form({ userId: ana.id, code: code(), reason: "Spam" }));
    expect((await db.select({ reason: user.suspensionReason }).from(user).where(eq(user.id, ana.id)))[0].reason).toBe("Spam");
  });

  it("reactivateAccountAction reactiva y vuelve a dibujar la página", async () => {
    const { ana, code } = await seed();
    await db.update(user).set({ suspendedAt: new Date() }).where(eq(user.id, ana.id));
    expect(await reactivateAccountAction({}, form({ userId: ana.id, code: code() }))).toEqual({ message: "Se reactivó la cuenta de Ana Pérez." });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("deleteAccountByAdminAction borra la cuenta y lleva a la lista con el aviso", async () => {
    const { ana, code } = await seed();
    await expect(deleteAccountByAdminAction({}, form({ userId: ana.id, code: code(), email: ana.email }))).rejects.toThrow(
      "NEXT_REDIRECT /admin/usuarios?aviso=cuenta-eliminada",
    );
    expect(await db.select().from(user).where(eq(user.id, ana.id))).toEqual([]);
  });
});

describe("con un error", () => {
  it.each([
    ["unlockLoginAction", unlockLoginAction],
    ["revokeSessionsAction", revokeSessionsAction],
    ["unlinkWhatsAppByAdminAction", unlinkWhatsAppByAdminAction],
    ["suspendAccountAction", suspendAccountAction],
    ["reactivateAccountAction", reactivateAccountAction],
    ["deleteAccountByAdminAction", deleteAccountByAdminAction],
  ] as const)("%s devuelve el error junto a su campo, sin redibujar ni redirigir", async (_, action) => {
    const { ana } = await seed();
    // Para reactivar, la cuenta tiene que estar suspendida (si no, avisa antes de mirar el código).
    if (action === reactivateAccountAction) await db.update(user).set({ suspendedAt: new Date() }).where(eq(user.id, ana.id));
    expect(await action({}, form({ userId: ana.id, code: "12345", email: ana.email }))).toEqual({
      error: "Escribe los 6 dígitos del código de Google Authenticator.",
      field: "code",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["unlockLoginAction", unlockLoginAction],
    ["revokeSessionsAction", revokeSessionsAction],
    ["unlinkWhatsAppByAdminAction", unlinkWhatsAppByAdminAction],
    ["suspendAccountAction", suspendAccountAction],
    ["reactivateAccountAction", reactivateAccountAction],
    ["deleteAccountByAdminAction", deleteAccountByAdminAction],
  ] as const)("%s con el formulario vacío no se rompe ni toca nada", async (_, action) => {
    await seed();
    expect(await action({}, new FormData())).toEqual({ error: "Esta cuenta ya no existe." });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("eliminar con otro correo marca el campo del correo", async () => {
    const { ana, code } = await seed();
    expect(await deleteAccountByAdminAction({}, form({ userId: ana.id, code: code(), email: "otra@correo.com" }))).toEqual({
      error: "El correo no coincide con el de la cuenta.",
      field: "email",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("sin admin", () => {
  it.each([
    ["unlockLoginAction", unlockLoginAction],
    ["revokeSessionsAction", revokeSessionsAction],
    ["unlinkWhatsAppByAdminAction", unlinkWhatsAppByAdminAction],
    ["suspendAccountAction", suspendAccountAction],
    ["reactivateAccountAction", reactivateAccountAction],
    ["deleteAccountByAdminAction", deleteAccountByAdminAction],
  ] as const)("%s falla antes de tocar nada", async (_, action) => {
    const { ana, code } = await seed();
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(action({}, form({ userId: ana.id, code: code(), email: ana.email }))).rejects.toThrow("NEXT_NOT_FOUND");
    // La valida la acción misma, antes de llamar a la capa de datos (que también la valida).
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(await db.select().from(user).where(eq(user.id, ana.id))).toHaveLength(1);
    expect(await db.select().from(loginFailure).where(eq(loginFailure.email, ana.email))).toHaveLength(1);
    expect(await db.select().from(session).where(eq(session.userId, ana.id))).toHaveLength(1);
    expect(await db.select().from(whatsappLink).where(eq(whatsappLink.userId, ana.id))).toHaveLength(1);
    expect(await db.select().from(accountEvent)).toEqual([]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
