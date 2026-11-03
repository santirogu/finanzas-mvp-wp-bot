import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { reminderSetting, transaction } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { createUser } from "../../../test/integration/factories";

// Configuración → Recordatorio de registro y el recordatorio de cada cuenta, contra la base de pruebas, con dos
// usuarios. La sesión y el refresco de la página se simulan.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { getRegisterReminder, getReminderSettings, saveReminderSettings } = await import("./reminders");
const { saveReminderSettingsAction } = await import("./actions");

const BOGOTA = "America/Bogota";
const rowsOf = (userId: string) =>
  db.select({ enabled: reminderSetting.enabled, days: reminderSetting.days }).from(reminderSetting).where(eq(reminderSetting.userId, userId));
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
/** Un movimiento registrado en ese momento (por la web o por WhatsApp: cuenta igual). */
const registered = (userId: string, createdAt: string, deletedAt: string | null = null) =>
  db.insert(transaction).values({
    userId,
    type: "expense",
    amount: 10000,
    description: "Almuerzo",
    occurredOn: createdAt.slice(0, 10),
    createdAt: new Date(createdAt),
    deletedAt: deletedAt ? new Date(deletedAt) : null,
  });

async function signIn() {
  const user = await createUser();
  session.current = { ...user, role: user.role, superAdmin: user.superAdmin, twoFactorEnabled: user.twoFactorEnabled };
  return user;
}

beforeEach(() => {
  session.current = null;
  vi.mocked(refresh).mockClear();
});

describe("getReminderSettings y saveReminderSettings", () => {
  it("sin guardar nada: prendido, con 3 días", async () => {
    const user = await createUser();
    expect(await getReminderSettings(user.id)).toEqual({ enabled: true, days: 3 });
  });

  it.each([
    ["1", 1, "Se guardó: te lo recordaremos si pasa 1 día sin registrar nada"],
    ["7", 7, "Se guardó: te lo recordaremos si pasan 7 días sin registrar nada"],
    [" 14 ", 14, "Se guardó: te lo recordaremos si pasan 14 días sin registrar nada"],
  ])("prendido con %j días: los guarda y avisa en verde", async (raw, days, message) => {
    const user = await createUser();
    expect(await saveReminderSettings(user.id, { enabled: "on", days: raw })).toEqual({ ok: true, message, tone: "success" });
    expect(await getReminderSettings(user.id)).toEqual({ enabled: true, days });
  });

  it("apagarlo conserva los días (el campo no llega) y avisa en rojo; prenderlo otra vez los cambia", async () => {
    const user = await createUser();
    await saveReminderSettings(user.id, { enabled: "on", days: "7" });
    expect(await saveReminderSettings(user.id, { enabled: null, days: null })).toEqual({
      ok: true,
      message: "Se apagó el recordatorio de registro",
      tone: "removal",
    });
    expect(await rowsOf(user.id)).toEqual([{ enabled: false, days: 7 }]);
    await saveReminderSettings(user.id, { enabled: "on", days: "2" });
    expect(await rowsOf(user.id)).toEqual([{ enabled: true, days: 2 }]);
  });

  it("apagado sin haber guardado nunca: con los días por defecto", async () => {
    const user = await createUser();
    await saveReminderSettings(user.id, { enabled: null, days: null });
    expect(await getReminderSettings(user.id)).toEqual({ enabled: false, days: 3 });
  });

  it.each([["0"], ["15"], ["-1"], ["2.5"], ["dos"], [""], ["100"]])("con %j días no guarda nada y dice el rango", async (raw) => {
    const user = await createUser();
    expect(await saveReminderSettings(user.id, { enabled: "on", days: raw })).toEqual({
      ok: false,
      error: "Escribe un número de días de 1 a 14.",
      field: "days",
    });
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("prendido sin días (alguien que arma el pedido a mano) tampoco", async () => {
    const user = await createUser();
    expect((await saveReminderSettings(user.id, { enabled: "on", days: null })).ok).toBe(false);
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("la configuración de una cuenta no le cambia nada a otra", async () => {
    const [ana, beto] = await Promise.all([createUser(), createUser()]);
    await saveReminderSettings(beto.id, { enabled: null, days: null });
    expect(await getReminderSettings(ana.id)).toEqual({ enabled: true, days: 3 });
  });
});

describe("getRegisterReminder", () => {
  it("sin movimientos: desde el día en que creó la cuenta, en su zona", async () => {
    // 03:00 en UTC es el 19 a las 22:00 en Bogotá.
    const user = await createUser({ createdAt: new Date("2026-10-20T03:00:00Z") });
    expect(await getRegisterReminder(user.id, BOGOTA, "2026-10-23")).toEqual({ since: "2026-10-19", days: 4, firstTime: true });
    expect(await getRegisterReminder(user.id, BOGOTA, "2026-10-21")).toBeNull();
  });

  it("desde su último movimiento registrado (no la fecha del movimiento), en su zona", async () => {
    const user = await createUser({ createdAt: new Date("2026-01-05T15:00:00Z") });
    await registered(user.id, "2026-10-10T15:00:00Z");
    // Registrado el 20 a las 02:00 UTC: en Bogotá todavía era el 19.
    await registered(user.id, "2026-10-20T02:00:00Z");
    expect(await getRegisterReminder(user.id, BOGOTA, "2026-10-23")).toEqual({ since: "2026-10-19", days: 4, firstTime: false });
    expect(await getRegisterReminder(user.id, BOGOTA, "2026-10-21")).toBeNull();
  });

  it("los eliminados no cuentan; si solo hay eliminados, es como si nunca hubiera registrado", async () => {
    const user = await createUser({ createdAt: new Date("2026-10-01T15:00:00Z") });
    await registered(user.id, "2026-10-12T15:00:00Z");
    await registered(user.id, "2026-10-22T15:00:00Z", "2026-10-22T16:00:00Z");
    expect(await getRegisterReminder(user.id, BOGOTA, "2026-10-23")).toEqual({ since: "2026-10-12", days: 11, firstTime: false });

    const other = await createUser({ createdAt: new Date("2026-10-01T15:00:00Z") });
    await registered(other.id, "2026-10-22T15:00:00Z", "2026-10-22T16:00:00Z");
    expect(await getRegisterReminder(other.id, BOGOTA, "2026-10-23")).toEqual({ since: "2026-10-01", days: 22, firstTime: true });
  });

  it("con los días que eligió; apagado, nunca", async () => {
    const user = await createUser({ createdAt: new Date("2026-01-05T15:00:00Z") });
    await registered(user.id, "2026-10-21T15:00:00Z");
    expect(await getRegisterReminder(user.id, BOGOTA, "2026-10-23")).toBeNull();
    await saveReminderSettings(user.id, { enabled: "on", days: "1" });
    expect(await getRegisterReminder(user.id, BOGOTA, "2026-10-23")).toMatchObject({ days: 2 });
    await saveReminderSettings(user.id, { enabled: null, days: null });
    expect(await getRegisterReminder(user.id, BOGOTA, "2026-10-23")).toBeNull();
  });

  it("solo cuentan los movimientos de la persona", async () => {
    const [ana, beto] = await Promise.all([
      createUser({ createdAt: new Date("2026-10-01T15:00:00Z") }),
      createUser({ createdAt: new Date("2026-10-01T15:00:00Z") }),
    ]);
    await registered(beto.id, "2026-10-23T15:00:00Z");
    expect(await getRegisterReminder(ana.id, BOGOTA, "2026-10-23")).toMatchObject({ since: "2026-10-01", firstTime: true });
    expect(await getRegisterReminder(beto.id, BOGOTA, "2026-10-23")).toBeNull();
  });

  it("de una cuenta que ya no existe, nada", async () => {
    expect(await getRegisterReminder("no-existe", BOGOTA, "2026-10-23")).toBeNull();
  });
});

describe("saveReminderSettingsAction", () => {
  it("sin sesión lleva al login", async () => {
    await expect(saveReminderSettingsAction({}, form({ enabled: "on", days: "5" }))).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("guarda la de quien tiene la sesión (nunca la de otro), refresca la página y devuelve el aviso", async () => {
    const other = await createUser();
    const user = await signIn();
    expect(await saveReminderSettingsAction({}, form({ enabled: "on", days: "5", userId: other.id }))).toEqual({
      message: "Se guardó: te lo recordaremos si pasan 5 días sin registrar nada",
      tone: "success",
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(await rowsOf(user.id)).toEqual([{ enabled: true, days: 5 }]);
    expect(await rowsOf(other.id)).toEqual([]);
  });

  it("con un error lo devuelve con su campo, no guarda nada y no refresca", async () => {
    const user = await signIn();
    expect(await saveReminderSettingsAction({}, form({ enabled: "on", days: "15" }))).toEqual({
      error: "Escribe un número de días de 1 a 14.",
      field: "days",
    });
    expect(await rowsOf(user.id)).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("saveReminderSettings · en inglés", () => {
  it("los avisos y el error, en inglés", async () => {
    const user = await createUser();
    expect(await saveReminderSettings(user.id, { enabled: "on", days: "5" }, "en")).toEqual({
      ok: true,
      message: "Saved: we'll remind you if 5 days go by without adding anything",
      tone: "success",
    });
    expect(await saveReminderSettings(user.id, { enabled: "on", days: "1" }, "en")).toMatchObject({
      message: "Saved: we'll remind you if 1 day goes by without adding anything",
    });
    expect(await saveReminderSettings(user.id, { enabled: null, days: null }, "en")).toEqual({ ok: true, message: "The reminder to add transactions was turned off", tone: "removal" });
    expect(await saveReminderSettings(user.id, { enabled: "on", days: "0" }, "en")).toEqual({ ok: false, error: "Enter a number of days from 1 to 14.", field: "days" });
  });
});
