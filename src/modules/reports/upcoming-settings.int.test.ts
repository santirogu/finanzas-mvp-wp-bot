import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { notificationSetting } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { createUser } from "../../../test/integration/factories";

// Mi cuenta → Notificaciones: la configuración de los avisos de próximos pagos y su Server Action, contra
// la base de pruebas, con dos usuarios. La sesión y el refresco de la página se simulan.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { DEFAULT_UPCOMING_SETTINGS, getUpcomingSettings, saveUpcomingSettings } = await import("./upcoming-settings");
const { saveUpcomingSettingsAction } = await import("./actions");

const rowsOf = (userId: string) =>
  db
    .select({ enabled: notificationSetting.upcomingEnabled, days: notificationSetting.upcomingDays })
    .from(notificationSetting)
    .where(eq(notificationSetting.userId, userId));
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
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

describe("getUpcomingSettings y saveUpcomingSettings", () => {
  it("sin guardar nada: prendidos, con 3 días", async () => {
    const user = await createUser();
    expect(await getUpcomingSettings(user.id)).toEqual({ enabled: true, days: 3 });
    expect(DEFAULT_UPCOMING_SETTINGS).toEqual({ enabled: true, days: 3 });
  });

  it.each([
    ["0", 0, "Se guardó: te avisaremos el mismo día de cada pago fijo"],
    ["1", 1, "Se guardó: te avisaremos 1 día antes de cada pago fijo"],
    [" 10 ", 10, "Se guardó: te avisaremos 10 días antes de cada pago fijo"],
  ])("prendidos con %j días: los guarda y avisa en verde", async (raw, days, message) => {
    const user = await createUser();
    expect(await saveUpcomingSettings(user.id, { enabled: "on", days: raw })).toEqual({ ok: true, message, tone: "success" });
    expect(await getUpcomingSettings(user.id)).toEqual({ enabled: true, days });
  });

  it("apagarlos conserva los días (el campo no llega) y avisa en rojo; prenderlos otra vez los cambia", async () => {
    const user = await createUser();
    await saveUpcomingSettings(user.id, { enabled: "on", days: "7" });
    expect(await saveUpcomingSettings(user.id, { enabled: null, days: null })).toEqual({
      ok: true,
      message: "Se apagaron los avisos de próximos pagos",
      tone: "removal",
    });
    expect(await rowsOf(user.id)).toEqual([{ enabled: false, days: 7 }]);
    await saveUpcomingSettings(user.id, { enabled: "on", days: "2" });
    expect(await rowsOf(user.id)).toEqual([{ enabled: true, days: 2 }]);
  });

  it("apagados sin haber guardado nunca: con los días por defecto", async () => {
    const user = await createUser();
    await saveUpcomingSettings(user.id, { enabled: null, days: null });
    expect(await getUpcomingSettings(user.id)).toEqual({ enabled: false, days: 3 });
  });

  it.each([["11"], ["-1"], ["2.5"], ["dos"], [""], ["100"]])("con %j días no guarda nada y dice el rango", async (raw) => {
    const user = await createUser();
    expect(await saveUpcomingSettings(user.id, { enabled: "on", days: raw })).toEqual({
      ok: false,
      error: "Escribe un número entre 0 y 10.",
      field: "days",
    });
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("prendidos sin días (alguien que arma el pedido a mano) tampoco", async () => {
    const user = await createUser();
    expect((await saveUpcomingSettings(user.id, { enabled: "on", days: null })).ok).toBe(false);
  });

  it("la configuración de una cuenta no le cambia nada a otra", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await saveUpcomingSettings(beto.id, { enabled: null, days: null });
    expect(await getUpcomingSettings(ana.id)).toEqual({ enabled: true, days: 3 });
  });
});

describe("saveUpcomingSettingsAction", () => {
  it("sin sesión lleva al login", async () => {
    await expect(saveUpcomingSettingsAction({}, form({ enabled: "on", days: "5" }))).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("guarda la de quien tiene la sesión, refresca la página y devuelve el aviso", async () => {
    const user = await signIn();
    expect(await saveUpcomingSettingsAction({}, form({ enabled: "on", days: "5" }))).toEqual({
      message: "Se guardó: te avisaremos 5 días antes de cada pago fijo",
      tone: "success",
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(await rowsOf(user.id)).toEqual([{ enabled: true, days: 5 }]);
  });

  it("con un error lo devuelve con su campo, no guarda nada y no refresca", async () => {
    const user = await signIn();
    expect(await saveUpcomingSettingsAction({}, form({ enabled: "on", days: "12" }))).toEqual({
      error: "Escribe un número entre 0 y 10.",
      field: "days",
    });
    expect(await rowsOf(user.id)).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("saveUpcomingSettings · en inglés", () => {
  it("los avisos y el error, en inglés", async () => {
    const user = await signIn();
    expect(await saveUpcomingSettings(user.id, { enabled: "on", days: "5" }, "en")).toEqual({
      ok: true,
      message: "Saved: we'll notify you 5 days before each bill is due",
      tone: "success",
    });
    expect(await saveUpcomingSettings(user.id, { enabled: "on", days: "0" }, "en")).toMatchObject({ message: "Saved: we'll notify you the same day each bill is due" });
    expect(await saveUpcomingSettings(user.id, { enabled: null, days: null }, "en")).toEqual({ ok: true, message: "Upcoming payment notices were turned off", tone: "removal" });
    expect(await saveUpcomingSettings(user.id, { enabled: "on", days: "11" }, "en")).toEqual({ ok: false, error: "Enter a number between 0 and 10.", field: "days" });
  });
});
