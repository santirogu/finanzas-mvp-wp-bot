import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

function renderItem(props: Parameters<typeof EventItem>[0]) {
  render(
    <ol>
      <EventItem {...props} />
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
    expect(time).toHaveAttribute("title", "14 de oct de 2026, 9:41 p. m.");
  });

  it("en el detalle de una cuenta: fecha completa y sin repetir el correo", () => {
    const shown = renderItem({
      entry: entry({ type: "sessions_revoked", details: { sessions: 1 }, admin: { name: "Ana Admin" } }),
      inAccount: true,
    });
    expect(shown.meta).toBe("1 sesión · 14 de oct de 2026, 9:41 p. m.");
  });
});
