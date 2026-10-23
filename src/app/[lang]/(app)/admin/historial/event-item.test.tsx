import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/i18n/locales";
import type { LogEntry } from "@/modules/admin/history/events-log";
import { NO_FILTERS } from "@/modules/admin/history/log-filters";
import { EventItem } from "./event-item";

// Cada evento del historial como frase, con su detalle y su hora. Lo usan el Historial y el detalle
// de cada cuenta en Usuarios.

const ana = { name: "Ana Pérez", email: "ana@correo.com" };
const entry = (overrides: Partial<LogEntry>): LogEntry => ({
  id: "e1",
  type: "registered",
  phone: null,
  details: {},
  // 9:41 p. m. del 14 de octubre en Colombia.
  createdAt: new Date("2026-10-15T02:41:00Z"),
  account: ana,
  admin: null,
  ...overrides,
});

/** En español, salvo que se pida otro idioma. */
function renderItem({ locale = "es", ...props }: Omit<ComponentProps<typeof EventItem>, "locale"> & { locale?: Locale }) {
  render(
    <ol>
      <EventItem locale={locale} {...props} />
    </ol>,
  );
  const item = screen.getByRole("listitem");
  const [sentence, meta] = item.querySelectorAll("p");
  return { item, sentence: sentence.textContent, meta: meta.textContent, icon: item.querySelector("span[aria-hidden]")! };
}

describe("EventItem", () => {
  it.each([
    [{ type: "registered" }, "Ana Pérez se registró", "ana@correo.com · 9:41 p. m."],
    [{ type: "password_changed" }, "Ana Pérez cambió su contraseña", "ana@correo.com · 9:41 p. m."],
    [{ type: "whatsapp_code_created" }, "Ana Pérez pidió un código para vincular su WhatsApp", "ana@correo.com · 9:41 p. m."],
    [{ type: "whatsapp_linked", phone: "573001112233" }, "Ana Pérez vinculó su WhatsApp +57 300 111 2233", "ana@correo.com · 9:41 p. m."],
    [
      { type: "whatsapp_unlinked", phone: "573001112233", details: { reason: "by_user" } },
      "Ana Pérez desvinculó su WhatsApp +57 300 111 2233",
      "ana@correo.com · lo desvinculó la persona · 9:41 p. m.",
    ],
    [
      { type: "whatsapp_unlinked", phone: "573001112233", details: { reason: "number_moved" } },
      "Se desvinculó el WhatsApp +57 300 111 2233 de Ana Pérez",
      "ana@correo.com · el número pasó a otra cuenta · 9:41 p. m.",
    ],
    [
      { type: "whatsapp_link_failed", phone: "573009998877", details: { reason: "invalid_code" }, account: null },
      "Intento fallido de vinculación desde +57 300 999 8877",
      "Sin cuenta · código inválido o vencido · 9:41 p. m.",
    ],
  ] as const)("evento de la cuenta %j", (overrides, sentence, meta) => {
    const shown = renderItem({ entry: entry(overrides as Partial<LogEntry>) });
    expect(shown.sentence).toBe(sentence);
    expect(shown.meta).toBe(meta);
    expect(shown.icon.className).not.toContain("bg-admin-surface");
  });

  it.each([
    [{ type: "login_unlocked" }, "Ana Admin desbloqueó el inicio de sesión de Ana Pérez", "ana@correo.com · 9:41 p. m."],
    [{ type: "sessions_revoked", details: { sessions: 2 } }, "Ana Admin cerró las sesiones de Ana Pérez", "ana@correo.com · 2 sesiones · 9:41 p. m."],
    [
      { type: "whatsapp_unlinked", phone: "573001112233", details: { reason: "by_admin" } },
      "Ana Admin desvinculó el WhatsApp +57 300 111 2233 de Ana Pérez",
      "ana@correo.com · 9:41 p. m.",
    ],
    [
      { type: "account_suspended", details: { note: "Spam", sessions: 1 } },
      "Ana Admin suspendió la cuenta de Ana Pérez",
      "ana@correo.com · motivo: Spam · 1 sesión · 9:41 p. m.",
    ],
    [{ type: "account_reactivated" }, "Ana Admin reactivó la cuenta de Ana Pérez", "ana@correo.com · 9:41 p. m."],
    [
      { type: "admin_granted", details: { sessions: 2 } },
      "Ana Admin le dio el rol de admin a Ana Pérez",
      "ana@correo.com · 2 sesiones · 9:41 p. m.",
    ],
    [{ type: "admin_revoked" }, "Ana Admin le quitó el rol de admin a Ana Pérez", "ana@correo.com · 9:41 p. m."],
    // De la cuenta eliminada no queda ningún dato.
    [{ type: "account_deleted", account: null }, "Ana Admin eliminó una cuenta", "Sin datos de la cuenta · 9:41 p. m."],
  ] as const)("acción del admin %j, en su color", (overrides, sentence, meta) => {
    const shown = renderItem({ entry: entry({ admin: { name: "Ana Admin" }, ...(overrides as Partial<LogEntry>) }) });
    expect(shown.sentence).toBe(sentence);
    expect(shown.meta).toBe(meta);
    expect(shown.icon.className).toContain("bg-admin-surface");
  });

  it.each([
    ["bot_claude_paused", "Ana Admin pausó Claude en el bot"],
    ["bot_claude_resumed", "Ana Admin reanudó Claude en el bot"],
    ["bot_limits_changed", "Ana Admin cambió los topes de Claude por cuenta"],
    ["bot_monthly_limit_changed", "Ana Admin cambió el tope mensual de tokens de Claude"],
    ["bot_replies_resent", "Ana Admin reenvió las respuestas del bot que no habían salido"],
  ] as const)("acción del admin sobre el bot %s, en su color", (type, sentence) => {
    const shown = renderItem({ entry: entry({ type, account: null, admin: { name: "Ana Admin" } }) });
    expect(shown.sentence).toBe(sentence);
    expect(shown.icon.className).toContain("bg-admin-surface");
  });

  it.each([
    [{ type: "signup_mode_changed", details: { signupMode: "invite", previousSignupMode: "open" } }, "Ana Admin cambió quién puede crear una cuenta", "Configuración · ahora solo con invitación (antes abiertos) · 9:41 p. m."],
    [{ type: "signup_invite_added", details: { email: "beto@test.local" } }, "Ana Admin invitó a beto@test.local a crear una cuenta", "Configuración · 9:41 p. m."],
    [{ type: "signup_invite_removed", details: { email: "beto@test.local" } }, "Ana Admin quitó la invitación de beto@test.local", "Configuración · 9:41 p. m."],
    // Si esa persona eliminó su cuenta, su correo ya no está (src/modules/account/delete-account.ts).
    [{ type: "signup_invite_added" }, "Ana Admin invitó a alguien a crear una cuenta", "Configuración · 9:41 p. m."],
    [{ type: "signup_invite_removed" }, "Ana Admin quitó una invitación", "Configuración · 9:41 p. m."],
    [
      { type: "notice_published", details: { notice: { message: "Nuevo: presupuestos", tone: "info", endsAt: "2026-10-26T01:00:00.000Z" } } },
      "Ana Admin publicó un aviso para todos",
      "Configuración · “Nuevo: presupuestos” · información · hasta el 25 de oct. de 2026, 8:00 p. m. · 9:41 p. m.",
    ],
    [
      { type: "notice_removed", details: { notice: { message: "Nuevo: presupuestos", tone: "info", endsAt: "2026-10-26T01:00:00.000Z" } } },
      "Ana Admin quitó el aviso para todos",
      "Configuración · “Nuevo: presupuestos” · información · hasta el 25 de oct. de 2026, 8:00 p. m. · 9:41 p. m.",
    ],
  ] as const)("acción del admin sobre los registros %j, en su color", (overrides, sentence, meta) => {
    const shown = renderItem({ entry: entry({ account: null, admin: { name: "Ana Admin" }, ...(overrides as Partial<LogEntry>) }) });
    expect(shown.sentence).toBe(sentence);
    expect(shown.meta).toBe(meta);
    expect(shown.icon.className).toContain("bg-admin-surface");
  });

  it("si la cuenta del admin ya no existe, dice 'Un admin'", () => {
    expect(renderItem({ entry: entry({ type: "login_unlocked", admin: null }) }).sentence).toBe(
      "Un admin desbloqueó el inicio de sesión de Ana Pérez",
    );
    cleanup();
    expect(renderItem({ entry: entry({ type: "account_deleted", account: null, admin: null }) }).sentence).toBe(
      "Un admin eliminó una cuenta",
    );
  });

  it("en el Historial, el nombre lleva a los eventos de esa cuenta (desde los primeros 50)", () => {
    renderItem({ entry: entry({}), filters: { ...NO_FILTERS, types: ["registered"], limit: 150 } });
    expect(screen.getByRole("link", { name: "Ana Pérez" })).toHaveAttribute(
      "href",
      "/admin/historial?tipo=registered&q=ana%40correo.com",
    );
  });

  it("sin filtros (en el detalle de una cuenta), el nombre va sin enlace", () => {
    renderItem({ entry: entry({}) });
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("si no se sabe de qué cuenta es, dice 'Una cuenta'", () => {
    expect(renderItem({ entry: entry({ account: null }) }).sentence).toBe("Una cuenta se registró");
  });

  it("la hora lleva la fecha completa en su título", () => {
    const time = renderItem({ entry: entry({}) }).item.querySelector("time")!;
    expect(time).toHaveAttribute("datetime", "2026-10-15T02:41:00.000Z");
    expect(time).toHaveAttribute("title", "14 de oct. de 2026, 9:41 p. m.");
  });

  it("en el detalle de una cuenta: fecha completa y sin repetir el correo", () => {
    const shown = renderItem({
      entry: entry({ type: "sessions_revoked", details: { sessions: 1 }, admin: { name: "Ana Admin" } }),
      inAccount: true,
    });
    expect(shown.meta).toBe("1 sesión · 14 de oct. de 2026, 9:41 p. m.");
  });
});

describe("EventItem en inglés", () => {
  const carla = { name: "Carla Admin", email: "carla@correo.com" };

  it.each([
    [{ type: "registered" }, "Ana Pérez signed up", "ana@correo.com · 9:41 PM"],
    [{ type: "password_changed" }, "Ana Pérez changed their password", "ana@correo.com · 9:41 PM"],
    [{ type: "whatsapp_code_created" }, "Ana Pérez requested a code to link their WhatsApp", "ana@correo.com · 9:41 PM"],
    [{ type: "whatsapp_linked", phone: "573001112233" }, "Ana Pérez linked their WhatsApp +57 300 111 2233", "ana@correo.com · 9:41 PM"],
    [
      { type: "whatsapp_unlinked", phone: "573001112233", details: { reason: "by_user" } },
      "Ana Pérez unlinked their WhatsApp +57 300 111 2233",
      "ana@correo.com · the person unlinked it · 9:41 PM",
    ],
    [
      { type: "whatsapp_unlinked", phone: "573001112233", details: { reason: "number_moved" } },
      "The WhatsApp +57 300 111 2233 was unlinked from Ana Pérez",
      "ana@correo.com · the number moved to another account · 9:41 PM",
    ],
    [
      { type: "whatsapp_link_failed", phone: "573009998877", details: { reason: "invalid_code" }, account: null },
      "Failed linking attempt from +57 300 999 8877",
      "No account · invalid or expired code · 9:41 PM",
    ],
  ] as const)("evento de la cuenta %j", (overrides, sentence, meta) => {
    const shown = renderItem({ entry: entry(overrides as Partial<LogEntry>), locale: "en" });
    expect(shown.sentence).toBe(sentence);
    expect(shown.meta).toBe(meta);
  });

  it.each([
    [{ type: "whatsapp_unlinked", phone: "573001112233", details: { reason: "by_admin" } }, "Carla Admin unlinked the WhatsApp +57 300 111 2233 from Ana Pérez"],
    [{ type: "login_unlocked" }, "Carla Admin unlocked Ana Pérez's sign-in"],
    [{ type: "sessions_revoked", details: { sessions: 2 } }, "Carla Admin signed Ana Pérez out of their sessions"],
    [{ type: "account_suspended" }, "Carla Admin suspended Ana Pérez's account"],
    [{ type: "account_reactivated" }, "Carla Admin reactivated Ana Pérez's account"],
    [{ type: "admin_granted" }, "Carla Admin made Ana Pérez an admin"],
    [{ type: "admin_revoked" }, "Carla Admin removed Ana Pérez's admin role"],
    [{ type: "account_deleted", account: null }, "Carla Admin deleted an account"],
    [{ type: "bot_claude_paused", account: null }, "Carla Admin paused Claude in the bot"],
    [{ type: "bot_claude_resumed", account: null }, "Carla Admin resumed Claude in the bot"],
    [{ type: "bot_limits_changed", account: null }, "Carla Admin changed Claude's per-account limits"],
    [{ type: "bot_monthly_limit_changed", account: null }, "Carla Admin changed Claude's monthly token limit"],
    [{ type: "bot_replies_resent", account: null }, "Carla Admin resent the bot replies that hadn't gone out"],
    [{ type: "signup_mode_changed", account: null }, "Carla Admin changed who can create an account"],
    [{ type: "signup_invite_added", account: null, details: { email: "beto@test.local" } }, "Carla Admin invited beto@test.local to create an account"],
    [{ type: "signup_invite_removed", account: null, details: { email: "beto@test.local" } }, "Carla Admin removed the invitation for beto@test.local"],
    [{ type: "signup_invite_added", account: null }, "Carla Admin invited someone to create an account"],
    [{ type: "signup_invite_removed", account: null }, "Carla Admin removed an invitation"],
    [{ type: "notice_published", account: null }, "Carla Admin published a notice for everyone"],
    [{ type: "notice_removed", account: null }, "Carla Admin removed the notice for everyone"],
  ] as const)("acción del admin %j", (overrides, sentence) => {
    expect(renderItem({ entry: entry({ admin: carla, ...(overrides as Partial<LogEntry>) }), locale: "en" }).sentence).toBe(sentence);
  });

  it("sin la cuenta ni el admin: 'An admin' y 'an account' según dónde van", () => {
    expect(renderItem({ entry: entry({ type: "account_suspended", account: null }), locale: "en" }).sentence).toBe("An admin suspended an account");
    cleanup();
    expect(renderItem({ entry: entry({ type: "login_unlocked", account: null }), locale: "en" }).sentence).toBe("An admin unlocked an account's sign-in");
    cleanup();
    expect(renderItem({ entry: entry({ type: "registered", account: null }), locale: "en" }).sentence).toBe("An account signed up");
  });

  it("dónde fue: el bot, una cuenta eliminada, y el detalle de los topes", () => {
    const shown = renderItem({
      entry: entry({
        type: "bot_limits_changed",
        account: null,
        admin: carla,
        details: { limits: { perHour: 30, perDay: 1500 }, previousLimits: { perHour: 20, perDay: 100 } },
      }),
      locale: "en",
    });
    expect(shown.meta).toBe("WhatsApp bot · now 30 per hour and 1,500 per day (before 20 per hour and 100 per day) · 9:41 PM");
    cleanup();
    expect(renderItem({ entry: entry({ type: "account_deleted", account: null, admin: carla }), locale: "en" }).meta).toBe("No account data · 9:41 PM");
  });

  it("en el detalle de una cuenta, la fecha completa; en el Historial, el nombre lleva a sus eventos", () => {
    const shown = renderItem({ entry: entry({}), inAccount: true, locale: "en" });
    expect(shown.meta).toBe("Oct 14, 2026, 9:41 PM");
    expect(shown.item.querySelector("time")).toHaveAttribute("title", "Oct 14, 2026, 9:41 PM");
    cleanup();
    renderItem({ entry: entry({}), filters: NO_FILTERS, locale: "en" });
    expect(screen.getByRole("link", { name: "Ana Pérez" })).toHaveAttribute("href", "/admin/historial?q=ana%40correo.com");
  });
});
