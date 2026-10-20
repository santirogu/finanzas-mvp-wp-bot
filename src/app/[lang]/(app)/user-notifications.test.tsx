import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/session";
import type { UpcomingPayment } from "@/modules/reports/upcoming";

// UserNotifications es un componente de servidor: se ejecuta como función y se dibuja lo que devuelve.
const data = vi.hoisted(() => ({
  upcoming: { enabled: true, days: 3, payments: [] as (UpcomingPayment & { category: string })[] },
  read: new Set<string>(),
}));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async (): Promise<CurrentUser> => ({
    id: "u1",
    name: "Ana",
    email: "ana@test.local",
    timezone: "America/Bogota",
    currency: "COP",
    role: "user",
    superAdmin: false,
    twoFactorEnabled: false,
  })),
}));
vi.mock("@/modules/reports/queries", () => ({ getUpcomingPayments: vi.fn(async () => data.upcoming) }));
vi.mock("@/modules/notifications/reads", () => ({ getReadNotifications: vi.fn(async () => data.read) }));
vi.mock("@/modules/notifications/actions", () => ({ markNotificationsReadAction: vi.fn() }));
vi.mock("@/modules/reports/actions", () => ({ skipFixedPaymentAction: vi.fn(), registerFixedPaymentAction: vi.fn() }));

const { UserNotifications } = await import("./user-notifications");
const { getUpcomingPayments } = await import("@/modules/reports/queries");

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

  it("con los avisos apagados (Mi cuenta → Notificaciones), no hay campana", async () => {
    data.upcoming = { enabled: false, days: 3, payments: [] };
    expect(await UserNotifications()).toBeNull();
  });
});
