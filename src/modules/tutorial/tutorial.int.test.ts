import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import type { CurrentUser } from "@/lib/session";
import { createUser } from "../../../test/integration/factories";

// El tutorial de bienvenida: la capa de datos y su Server Action, contra la base de pruebas, con dos usuarios.
// La sesión se simula.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));

const { finishTutorial, isTutorialPending } = await import("./tutorial");
const { finishTutorialAction } = await import("./actions");

const doneAt = async (userId: string) =>
  (await db.select({ at: userTable.tutorialDoneAt }).from(userTable).where(eq(userTable.id, userId)))[0].at;

async function signIn() {
  const user = await createUser();
  session.current = { ...user, role: user.role, superAdmin: user.superAdmin, twoFactorEnabled: user.twoFactorEnabled };
  return user;
}

beforeEach(() => {
  session.current = null;
});

describe("isTutorialPending y finishTutorial", () => {
  it("una cuenta nueva lo tiene pendiente hasta que lo termina u omite", async () => {
    const user = await createUser();
    expect(await isTutorialPending(user.id)).toBe(true);
    await finishTutorial(user.id);
    expect(await isTutorialPending(user.id)).toBe(false);
    expect(await doneAt(user.id)).toBeInstanceOf(Date);
  });

  it("terminarlo otra vez (desde otro navegador) deja la primera fecha", async () => {
    const user = await createUser();
    await finishTutorial(user.id);
    const first = await doneAt(user.id);
    await finishTutorial(user.id);
    expect(await doneAt(user.id)).toEqual(first);
  });

  it("solo cambia la cuenta indicada", async () => {
    const [ana, beto] = [await createUser(), await createUser()];
    await finishTutorial(ana.id);
    expect(await isTutorialPending(beto.id)).toBe(true);
  });

  it("una cuenta que no existe no lo tiene pendiente", async () => {
    expect(await isTutorialPending("no-existe")).toBe(false);
  });

  it("al crear la cuenta no se puede saltar: Better Auth no conoce el campo", async () => {
    const email = `tutorial-${crypto.randomUUID()}@test.local`;
    await auth.api.signUpEmail({
      body: { name: "Ana", email, password: "clave-segura-123", tutorialDoneAt: new Date("2026-01-01") } as never,
    });
    const [row] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email));
    expect(await isTutorialPending(row.id)).toBe(true);
  });
});

describe("finishTutorialAction", () => {
  it("lo da por visto en la cuenta de la sesión, y solo en esa", async () => {
    const other = await createUser();
    const me = await signIn();
    await finishTutorialAction();
    expect(await isTutorialPending(me.id)).toBe(false);
    expect(await isTutorialPending(other.id)).toBe(true);
  });

  it("sin sesión no cambia nada", async () => {
    const user = await createUser();
    await expect(finishTutorialAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(await isTutorialPending(user.id)).toBe(true);
  });
});
