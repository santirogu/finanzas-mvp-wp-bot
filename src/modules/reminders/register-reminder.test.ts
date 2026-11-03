import { describe, expect, it } from "vitest";
import { REMINDER_DAYS_MAX as SCHEMA_DAYS_MAX } from "@/db/schema/finance";
import {
  DEFAULT_REMINDER_SETTINGS,
  daysBetween,
  REMINDER_DAYS_MAX,
  REMINDER_DAYS_MESSAGES,
  type RegisterReminder,
  registerReminder,
  reminderNotificationId,
  reminderText,
} from "./register-reminder";

const on = (days: number) => ({ enabled: true, days });

describe("daysBetween", () => {
  it.each([
    ["2026-10-20", "2026-10-20", 0],
    ["2026-10-20", "2026-10-23", 3],
    ["2026-09-28", "2026-10-02", 4],
    ["2026-12-30", "2027-01-02", 3],
    ["2028-02-28", "2028-03-01", 2],
    ["2026-10-23", "2026-10-20", -3],
  ])("de %s a %s: %i", (from, to, days) => {
    expect(daysBetween(from, to)).toBe(days);
  });
});

describe("registerReminder", () => {
  it("por defecto: prendido, desde 3 días", () => {
    expect(DEFAULT_REMINDER_SETTINGS).toEqual({ enabled: true, days: 3 });
  });

  it("cuenta desde el último movimiento registrado, aunque la cuenta sea más vieja", () => {
    expect(registerReminder({ lastRegistered: "2026-10-19", accountCreated: "2026-01-05", today: "2026-10-23", settings: on(3) })).toEqual({
      since: "2026-10-19",
      days: 4,
      firstTime: false,
    });
  });

  it("toca justo al llegar a los días elegidos; antes, no", () => {
    const at = (today: string) => registerReminder({ lastRegistered: "2026-10-20", accountCreated: "2026-01-05", today, settings: on(3) });
    expect(at("2026-10-22")).toBeNull();
    expect(at("2026-10-23")).toMatchObject({ days: 3 });
  });

  it("con 1 día, toca desde el día siguiente; el mismo día del registro, nunca", () => {
    const at = (today: string) => registerReminder({ lastRegistered: "2026-10-23", accountCreated: "2026-01-05", today, settings: on(1) });
    expect(at("2026-10-23")).toBeNull();
    expect(at("2026-10-24")).toMatchObject({ days: 1 });
  });

  it("sin movimientos, cuenta desde que creó la cuenta: una cuenta nueva no lo recibe antes de tiempo", () => {
    const at = (today: string) => registerReminder({ lastRegistered: null, accountCreated: "2026-10-20", today, settings: on(3) });
    expect(at("2026-10-21")).toBeNull();
    expect(at("2026-10-25")).toEqual({ since: "2026-10-20", days: 5, firstTime: true });
  });

  it("apagado, nunca", () => {
    expect(registerReminder({ lastRegistered: "2026-01-01", accountCreated: "2026-01-01", today: "2026-10-23", settings: { enabled: false, days: 3 } })).toBeNull();
  });
});

describe("reminderNotificationId", () => {
  it("cambia con cada hueco: marcarlo leído no esconde el siguiente", () => {
    expect(reminderNotificationId({ since: "2026-10-19" })).toBe("registro|2026-10-19");
    expect(reminderNotificationId({ since: "2026-10-30" })).not.toBe(reminderNotificationId({ since: "2026-10-19" }));
  });
});

describe("reminderText", () => {
  const reminder = (days: number, firstTime = false): RegisterReminder => ({ since: "2026-10-19", days, firstTime });

  it.each([
    [reminder(1), "es", "Llevas 1 día sin registrar nada."],
    [reminder(4), "es", "Llevas 4 días sin registrar nada."],
    [reminder(9, true), "es", "Todavía no registras ningún movimiento."],
    [reminder(1), "en", "You haven't added anything in 1 day."],
    [reminder(4), "en", "You haven't added anything in 4 days."],
    [reminder(9, true), "en", "You haven't added any transactions yet."],
  ] as const)("%o en %s: %s", (r, locale, title) => {
    expect(reminderText(r, locale).title).toBe(title);
  });

  it("el porqué, en los dos idiomas; sin idioma, en español", () => {
    expect(reminderText(reminder(4))).toEqual({ title: "Llevas 4 días sin registrar nada.", hint: "Registra lo que te falte para que tus cuentas del mes queden completas." });
    expect(reminderText(reminder(4), "en").hint).toBe("Add what's missing so your month's numbers stay complete.");
  });
});

describe("el rango de los días", () => {
  it("es el mismo que revisa la base (reminder_setting_days)", () => {
    expect(REMINDER_DAYS_MAX).toBe(SCHEMA_DAYS_MAX);
  });

  it("su error dice el rango, en los dos idiomas", () => {
    expect(REMINDER_DAYS_MESSAGES).toEqual({ es: "Escribe un número de días de 1 a 14.", en: "Enter a number of days from 1 to 14." });
  });
});
