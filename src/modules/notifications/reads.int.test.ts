import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { notificationRead } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { createUser } from "../../../test/integration/factories";

// "Marcar como leído" en la campana: la capa de datos y su Server Action, contra la base de pruebas, con
// dos usuarios. La sesión y el refresco de la página se simulan.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { getReadNotifications, markNotificationsRead } = await import("./reads");
const { markNotificationsReadAction } = await import("./actions");

const rowsOf = (userId: string) =>
  db.select({ id: notificationRead.notificationId }).from(notificationRead).where(eq(notificationRead.userId, userId));
const form = (ids: string[]) => {
  const data = new FormData();
  for (const id of ids) data.append("id", id);
  return data;
};

async function signIn() {
  const user = await createUser();
  session.current = { ...user, role: user.role, superAdmin: user.superAdmin, twoFactorEnabled: user.twoFactorEnabled };
  return user;
}

beforeEach(() => {
  session.current = null;
  vi.mocked(refresh).mockClear();
});

describe("getReadNotifications y markNotificationsRead", () => {
  it("marca una y avisa en verde; marcarla otra vez no hace nada más", async () => {
    const user = await createUser();
    expect(await markNotificationsRead(user.id, ["pago|2026-10|arriendo"])).toEqual({ ok: true, message: "Se marcó como leída", tone: "success" });
    expect(await markNotificationsRead(user.id, ["pago|2026-10|arriendo"])).toMatchObject({ ok: true });
    expect(await getReadNotifications(user.id)).toEqual(new Set(["pago|2026-10|arriendo"]));
  });

  it("marca varias de una vez (sin repetir)", async () => {
    const user = await createUser();
    const ids = ["pago|2026-10|arriendo", "pago|2026-10|gimnasio", "pago|2026-10|arriendo"];
    expect(await markNotificationsRead(user.id, ids)).toEqual({ ok: true, message: "Se marcaron 2 como leídas", tone: "success" });
    expect((await rowsOf(user.id)).map((r) => r.id).sort()).toEqual(["pago|2026-10|arriendo", "pago|2026-10|gimnasio"]);
  });

  it("también el recordatorio de registro y las alertas del bot (cada id con su tipo)", async () => {
    const user = await createUser();
    const ids = ["registro|2026-10-16", "bot|whatsapp_token|2026-10-23T14:05:00.000Z", "bot|monthly_limit|2026-11-01"];
    expect(await markNotificationsRead(user.id, ids)).toEqual({ ok: true, message: "Se marcaron 3 como leídas", tone: "success" });
    expect(await getReadNotifications(user.id)).toEqual(new Set(ids));
  });

  it.each([[[]], [["otro|2026-10|x"]], [["bot|otra|2026-10-23"]], [["pago|2026-10|x", "mal"]], [[null]], [Array.from({ length: 51 }, (_, i) => `pago|2026-10|g${i}`)]])(
    "con %j no marca nada",
    async (ids) => {
      const user = await createUser();
      expect(await markNotificationsRead(user.id, ids)).toEqual({ ok: false, error: "No se pudo marcar como leída. Intenta de nuevo." });
      expect(await rowsOf(user.id)).toEqual([]);
    },
  );

  it("lo que marca una cuenta no le cambia nada a otra", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await markNotificationsRead(beto.id, ["pago|2026-10|arriendo"]);
    expect(await getReadNotifications(ana.id)).toEqual(new Set());
  });
});

describe("markNotificationsReadAction", () => {
  it("sin sesión lleva al login", async () => {
    await expect(markNotificationsReadAction({}, form(["pago|2026-10|arriendo"]))).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("marca las de quien tiene la sesión, refresca la página y devuelve el aviso", async () => {
    const user = await signIn();
    expect(await markNotificationsReadAction({}, form(["pago|2026-10|arriendo", "pago|2026-09|arriendo"]))).toEqual({
      message: "Se marcaron 2 como leídas",
      tone: "success",
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(await rowsOf(user.id)).toHaveLength(2);
  });

  it("con un error lo devuelve, no marca nada y no refresca", async () => {
    const user = await signIn();
    expect(await markNotificationsReadAction({}, form([]))).toEqual({ error: "No se pudo marcar como leída. Intenta de nuevo." });
    expect(await rowsOf(user.id)).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("markNotificationsRead · en inglés", () => {
  it("los avisos y el error, en inglés", async () => {
    const { id } = await createUser();
    expect(await markNotificationsRead(id, ["pago|2026-10|arriendo"], "en")).toEqual({ ok: true, message: "Marked as read", tone: "success" });
    expect(await markNotificationsRead(id, ["pago|2026-10|gimnasio", "pago|2026-10|netflix"], "en")).toMatchObject({ message: "2 marked as read" });
    expect(await markNotificationsRead(id, ["otra cosa"], "en")).toEqual({ ok: false, error: "It couldn't be marked as read. Try again." });
  });
});
