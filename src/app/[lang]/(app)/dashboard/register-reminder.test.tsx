import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n/locales";
import type { RegisterReminder } from "@/modules/reminders/register-reminder";

// RegisterReminderCard es un componente de servidor: se ejecuta como función y se dibuja lo que devuelve.
const mocks = vi.hoisted(() => ({
  reminder: null as RegisterReminder | null,
  link: null as { phone: string } | null,
  locale: "es" as Locale,
  getRegisterReminder: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(async () => ({ id: "u1", timezone: "America/Bogota" })) }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => mocks.locale }));
vi.mock("@/modules/reminders/reminders", () => ({ getRegisterReminder: mocks.getRegisterReminder }));
vi.mock("@/modules/whatsapp/link", () => ({ getLinkForUser: vi.fn(async () => mocks.link) }));

const { RegisterReminderCard } = await import("./register-reminder");

const card = () => within(screen.getByRole("region"));

beforeEach(() => {
  mocks.reminder = { since: "2026-10-19", days: 4, firstTime: false };
  mocks.link = null;
  mocks.locale = "es";
  mocks.getRegisterReminder.mockReset().mockImplementation(async () => mocks.reminder);
  vi.stubEnv("WHATSAPP_DISPLAY_NUMBER", "+57 300 111 2233");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RegisterReminderCard", () => {
  it("cuántos días van sin registrar, por qué y el enlace para registrar un egreso", async () => {
    render(await RegisterReminderCard({ today: "2026-10-23" }));
    expect(mocks.getRegisterReminder).toHaveBeenCalledWith("u1", "America/Bogota", "2026-10-23");
    expect(screen.getByRole("heading", { level: 2, name: "Llevas 4 días sin registrar nada." })).toBeVisible();
    expect(card().getByText("Registra lo que te falte para que tus cuentas del mes queden completas.")).toBeVisible();
    expect(card().getByRole("link", { name: "Registrar un egreso" })).toHaveAttribute("href", "/egresos");
    // Sin WhatsApp vinculado, no ofrece escribirle al bot (WhatsAppHint ya invita a conectarlo).
    expect(card().queryByRole("link", { name: "Escribirle al bot" })).toBeNull();
  });

  it("si nunca registró nada, lo dice así", async () => {
    mocks.reminder = { since: "2026-10-18", days: 5, firstTime: true };
    render(await RegisterReminderCard({ today: "2026-10-23" }));
    expect(screen.getByRole("heading", { level: 2, name: "Todavía no registras ningún movimiento." })).toBeVisible();
  });

  it("con WhatsApp vinculado, también el enlace para escribirle al bot, en otra pestaña", async () => {
    mocks.link = { phone: "573009998877" };
    render(await RegisterReminderCard({ today: "2026-10-23" }));
    const bot = card().getByRole("link", { name: "Escribirle al bot" });
    expect(bot).toHaveAttribute("href", "https://wa.me/573001112233");
    expect(bot).toHaveAttribute("target", "_blank");
    expect(bot).toHaveAttribute("rel", "noreferrer");
  });

  it("con WhatsApp vinculado pero sin el número del bot configurado, sin ese enlace", async () => {
    mocks.link = { phone: "573009998877" };
    vi.stubEnv("WHATSAPP_DISPLAY_NUMBER", "");
    render(await RegisterReminderCard({ today: "2026-10-23" }));
    expect(card().queryByRole("link", { name: "Escribirle al bot" })).toBeNull();
  });

  it("si no toca, no muestra nada", async () => {
    mocks.reminder = null;
    const { container } = render(<>{await RegisterReminderCard({ today: "2026-10-23" })}</>);
    expect(container).toBeEmptyDOMElement();
  });

  it("en inglés", async () => {
    mocks.locale = "en";
    mocks.link = { phone: "573009998877" };
    render(await RegisterReminderCard({ today: "2026-10-23" }));
    const reminder = within(screen.getByRole("region", { name: "You haven't added anything in 4 days." }));
    expect(reminder.getByText("Add what's missing so your month's numbers stay complete.")).toBeVisible();
    expect(reminder.getByRole("link", { name: "Add an expense" })).toHaveAttribute("href", "/egresos");
    expect(reminder.getByRole("link", { name: "Message the bot" })).toBeVisible();
  });
});
