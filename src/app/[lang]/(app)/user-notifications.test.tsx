import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/session";
import type { BotAlert } from "@/modules/bot/alert-rules";
import type { RegisterReminder, ReminderSettings } from "@/modules/reminders/register-reminder";
import type { UpcomingPayment } from "@/modules/reports/upcoming";

// UserNotifications es un componente de servidor: se ejecuta como función y se dibuja lo que devuelve.
const data = vi.hoisted(() => ({
  upcoming: { enabled: true, days: 3, payments: [] as (UpcomingPayment & { category: string })[] },
  read: new Set<string>(),
  reminderSettings: { enabled: true, days: 3 } as ReminderSettings,
  reminder: null as RegisterReminder | null,
  role: "user" as CurrentUser["role"],
  twoFactorEnabled: false,
  alerts: [] as BotAlert[],
}));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async (): Promise<CurrentUser> => ({
    id: "u1",
    name: "Ana",
    email: "ana@test.local",
    timezone: "America/Bogota",
    currency: "COP",
    role: data.role,
    superAdmin: false,
    twoFactorEnabled: data.twoFactorEnabled,
  })),
  canAdminister: (user: CurrentUser) => user.role === "admin" && user.twoFactorEnabled,
}));
vi.mock("@/modules/admin/bot/alerts", () => ({ botAlerts: vi.fn(async () => data.alerts) }));
vi.mock("@/modules/reports/queries", () => ({ getUpcomingPayments: vi.fn(async () => data.upcoming) }));
vi.mock("@/modules/notifications/reads", () => ({ getReadNotifications: vi.fn(async () => data.read) }));
vi.mock("@/modules/reminders/reminders", () => ({
  getReminderSettings: vi.fn(async () => data.reminderSettings),
  getRegisterReminder: vi.fn(async () => data.reminder),
}));
vi.mock("@/modules/notifications/actions", () => ({ markNotificationsReadAction: vi.fn() }));
vi.mock("@/modules/reports/actions", () => ({ skipFixedPaymentAction: vi.fn(), registerFixedPaymentAction: vi.fn() }));

const { UserNotifications } = await import("./user-notifications");
const { getUpcomingPayments } = await import("@/modules/reports/queries");
const { getRegisterReminder } = await import("@/modules/reminders/reminders");
const { botAlerts } = await import("@/modules/admin/bot/alerts");

const payment = (key: string): UpcomingPayment & { category: string } => ({
  key,
  description: key,
  emoji: "🏠",
  amount: 1000,
  month: "2026-10",
  date: "2026-10-22",
  days: 2,
  usualDay: 22,
  approximate: false,
  category: "Sin categoría",
});

beforeEach(() => {
  data.upcoming = { enabled: true, days: 3, payments: [payment("arriendo"), payment("gimnasio")] };
  data.read = new Set();
  data.reminderSettings = { enabled: true, days: 3 };
  data.reminder = null;
  data.role = "user";
  data.twoFactorEnabled = false;
  data.alerts = [{ kind: "monthly_limit", resetsOn: "2026-11-01" }];
  vi.mocked(botAlerts).mockClear();
});

describe("UserNotifications", () => {
  it("la campana con los avisos de la persona, de hoy en su zona", async () => {
    render(await UserNotifications());
    expect(screen.getByRole("button", { name: "Notificaciones: 2 sin leer" })).toBeVisible();
    const [userId, , today] = vi.mocked(getUpcomingPayments).mock.calls[0];
    expect(userId).toBe("u1");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("no cuenta las que ya marcó como leídas", async () => {
    data.read = new Set(["pago|2026-10|arriendo"]);
    render(await UserNotifications());
    expect(screen.getByRole("button", { name: "Notificaciones: 1 sin leer" })).toBeVisible();
  });

  it("con el recordatorio de registro, primero, y con el mismo día de hoy", async () => {
    data.reminder = { since: "2026-10-18", days: 4, firstTime: false };
    render(await UserNotifications());
    expect(screen.getByRole("button", { name: "Notificaciones: 3 sin leer" })).toBeVisible();
    const [userId, timezone, today] = vi.mocked(getRegisterReminder).mock.calls[0];
    expect([userId, timezone]).toEqual(["u1", "America/Bogota"]);
    expect(today).toBe(vi.mocked(getUpcomingPayments).mock.calls[0][2]);
    expect(screen.getAllByText(/sin registrar nada|Próximos pagos/).map((p) => p.textContent)).toEqual([
      "Llevas 4 días sin registrar nada.",
      "Próximos pagos de tus gastos fijos.",
    ]);
  });

  it("el recordatorio leído no cuenta", async () => {
    data.reminder = { since: "2026-10-18", days: 4, firstTime: false };
    data.read = new Set(["registro|2026-10-18"]);
    render(await UserNotifications());
    expect(screen.getByRole("button", { name: "Notificaciones: 2 sin leer" })).toBeVisible();
  });

  it("con los avisos de pagos apagados, la campana sigue por el recordatorio, sin el enlace a los pagos", async () => {
    data.upcoming = { enabled: false, days: 3, payments: [] };
    data.reminder = { since: "2026-10-18", days: 4, firstTime: false };
    render(await UserNotifications());
    expect(screen.getByRole("button", { name: "Notificaciones: 1 sin leer" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Ver los próximos pagos en el Resumen", hidden: true })).toBeNull();
  });

  it("a quien no es admin no le busca las alertas del bot", async () => {
    render(await UserNotifications());
    expect(botAlerts).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Notificaciones: 2 sin leer" })).toBeVisible();
  });

  it("a un admin sin la verificación en dos pasos tampoco (no puede entrar a la administración)", async () => {
    data.role = "admin";
    render(await UserNotifications());
    expect(botAlerts).not.toHaveBeenCalled();
  });

  it("a un admin con la verificación, las alertas del bot primero, en su idioma, con su id", async () => {
    data.role = "admin";
    data.twoFactorEnabled = true;
    data.read = new Set(["pago|2026-10|arriendo"]);
    render(await UserNotifications());
    expect(screen.getByRole("button", { name: "Notificaciones: 2 sin leer" })).toBeVisible();
    expect(screen.getAllByText(/tope mensual|Próximos pagos/).map((p) => p.textContent)).toEqual([
      "Se alcanzó el tope mensual de tokens: Claude está en pausa hasta el 1 de noviembre",
      "Próximos pagos de tus gastos fijos.",
    ]);
  });

  it("la alerta leída no cuenta; si vuelve a pasar (el mes siguiente), sí", async () => {
    data.role = "admin";
    data.twoFactorEnabled = true;
    data.read = new Set(["bot|monthly_limit|2026-11-01"]);
    render(await UserNotifications());
    expect(screen.getByRole("button", { name: "Notificaciones: 2 sin leer" })).toBeVisible();
  });

  it("al admin con alertas no se le apaga la campana aunque apague los avisos y el recordatorio", async () => {
    data.role = "admin";
    data.twoFactorEnabled = true;
    data.upcoming = { enabled: false, days: 3, payments: [] };
    data.reminderSettings = { enabled: false, days: 3 };
    render(await UserNotifications());
    expect(screen.getByRole("button", { name: "Notificaciones: 1 sin leer" })).toBeVisible();
    data.alerts = [];
    expect(await UserNotifications()).toBeNull();
  });

  it("con los avisos de pagos y el recordatorio apagados (Configuración), no hay campana", async () => {
    data.upcoming = { enabled: false, days: 3, payments: [] };
    data.reminderSettings = { enabled: false, days: 3 };
    expect(await UserNotifications()).toBeNull();
  });
});
