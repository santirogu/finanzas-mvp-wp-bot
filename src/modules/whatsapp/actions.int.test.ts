import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { whatsappLink, whatsappLinkCode } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { createUser } from "../../../test/integration/factories";
import { consumeLinkCode, createLinkCode, getLinkForUser } from "./link";

// Las Server Actions leen la sesión y refrescan la página: se simulan ambas cosas.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { generateLinkCodeAction, unlinkWhatsAppAction } = await import("./actions");

async function signIn(user: Awaited<ReturnType<typeof createUser>>) {
  session.current = {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    currency: user.currency,
    role: user.role,
  };
}

const codeOf = (userId: string) =>
  db
    .select({ codeHash: whatsappLinkCode.codeHash })
    .from(whatsappLinkCode)
    .where(eq(whatsappLinkCode.userId, userId))
    .then((rows) => rows[0]?.codeHash ?? null);

beforeEach(() => {
  session.current = null;
});

describe("generateLinkCodeAction", () => {
  it("exige sesión y no crea ningún código sin ella", async () => {
    await expect(generateLinkCodeAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(await db.select().from(whatsappLinkCode)).toEqual([]);
  });

  it("el código queda a nombre del usuario de la sesión y vincula el número a esa cuenta", async () => {
    const ana = await createUser({ name: "Ana" });
    const beto = await createUser({ name: "Beto" });
    await signIn(ana);

    const { code } = await generateLinkCodeAction();
    const result = await consumeLinkCode("573001112233", code);

    expect(result).toEqual({ ok: true, userId: ana.id, name: "Ana" });
    expect(await getLinkForUser(ana.id)).toMatchObject({ phone: "573001112233" });
    expect(await getLinkForUser(beto.id)).toBeNull();
  });

  it("no reemplaza el código pendiente de otro usuario", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await createLinkCode(beto.id);
    const betoCode = await codeOf(beto.id);

    await signIn(ana);
    await generateLinkCodeAction();

    expect(await codeOf(beto.id)).toBe(betoCode);
    expect(await codeOf(ana.id)).not.toBeNull();
  });
});

describe("unlinkWhatsAppAction", () => {
  it("exige sesión y no toca ningún vínculo sin ella", async () => {
    const ana = await createUser();
    await db.insert(whatsappLink).values({ userId: ana.id, phone: "573001112233" });

    await expect(unlinkWhatsAppAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(await getLinkForUser(ana.id)).not.toBeNull();
  });

  it("desvincula solo el número propio: el de otro usuario y su código siguen intactos", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await db.insert(whatsappLink).values([
      { userId: ana.id, phone: "573001112233" },
      { userId: beto.id, phone: "573009998877" },
    ]);
    await createLinkCode(ana.id);
    await createLinkCode(beto.id);

    await signIn(ana);
    await unlinkWhatsAppAction();

    expect(await getLinkForUser(ana.id)).toBeNull();
    expect(await codeOf(ana.id)).toBeNull();
    expect(await getLinkForUser(beto.id)).toMatchObject({ phone: "573009998877" });
    expect(await codeOf(beto.id)).not.toBeNull();
  });
});
