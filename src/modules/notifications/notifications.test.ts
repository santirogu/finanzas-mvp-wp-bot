import { describe, expect, it } from "vitest";
import { NOTIFICATION_ID_MAX_LENGTH } from "@/db/schema";
import type { BotAlertView } from "@/modules/admin/bot/alerts-view";
import type { BotAlert } from "@/modules/bot/alert-rules";
import type { UpcomingItem } from "@/modules/reports/upcoming";
import { botAlertNotificationId, isNotificationId, NOTIFICATION_ID_MAX, paymentNotificationId, unreadNotifications } from "./notifications";

// Las notificaciones de la campana: su id (con el tipo adelante) y cuáles quedan sin leer.

const item = (key: string, month = "2026-10"): UpcomingItem => ({
  id: `${key} ${month}`,
  key,
  description: key,
  emoji: "🏠",
  month,
  monthName: "octubre",
  amount: "≈ −$1,00",
  when: "Hoy",
  dateLine: "",
  overdue: false,
  category: "Sin categoría",
  amountInput: "1,00",
});

describe("paymentNotificationId e isNotificationId", () => {
  it("el id de un aviso de pago: el tipo, el mes y la clave del gasto (que puede tener espacios)", () => {
    expect(paymentNotificationId(item("plan del celular"))).toBe("pago|2026-10|plan del celular");
    expect(isNotificationId("pago|2026-10|plan del celular")).toBe(true);
  });

  it("el del recordatorio de registro: el tipo y el día desde el que no registra nada", () => {
    expect(isNotificationId("registro|2026-10-20")).toBe(true);
  });

  it("el de una alerta del bot: el tipo de alerta y desde cuándo pasa (un día o un momento)", () => {
    expect(isNotificationId("bot|whatsapp_token|2026-10-23T14:05:00.000Z")).toBe(true);
    expect(isNotificationId("bot|monthly_limit|2026-11-01")).toBe(true);
    expect(isNotificationId("bot|stuck_messages|2026-10-23")).toBe(true);
  });

  it.each([
    ["otro|2026-10|x"],
    ["bot|otra_alerta|2026-10-23"],
    ["bot|constructor|2026-10-23"],
    ["bot|monthly_limit|2026-11"],
    ["bot|monthly_limit|2026-11-01|x"],
    ["bot|whatsapp_token|2026-10-23T14:05:00Z"],
    ["bot|whatsapp_token|2026-10-23 14:05"],
    ["bot||2026-10-23"],
    ["pago|2026-13|x"],
    ["pago|octubre|x"],
    ["pago|2026-10|"],
    [`pago|2026-10|${"x".repeat(200)}`],
    ["registro|2026-10"],
    ["registro|2026-10-32"],
    ["registro|2026-10-20|x"],
    [3],
    [null],
  ])(
    "%j no es un id válido",
    (value) => {
      expect(isNotificationId(value)).toBe(false);
    },
  );

  it("el largo máximo es el mismo que acepta la base", () => {
    expect(NOTIFICATION_ID_MAX).toBe(NOTIFICATION_ID_MAX_LENGTH);
  });
});

describe("botAlertNotificationId", () => {
  const since = new Date("2026-10-23T14:05:00.000Z");

  it.each<[BotAlert, string]>([
    [{ kind: "whatsapp_token", since, unsent: 2 }, "bot|whatsapp_token|2026-10-23T14:05:00.000Z"],
    [{ kind: "whatsapp_send", since, unsent: 3 }, "bot|whatsapp_send|2026-10-23T14:05:00.000Z"],
    [{ kind: "claude_key", since }, "bot|claude_key|2026-10-23T14:05:00.000Z"],
    [{ kind: "claude_model", since }, "bot|claude_model|2026-10-23T14:05:00.000Z"],
    [{ kind: "claude_credits", since }, "bot|claude_credits|2026-10-23T14:05:00.000Z"],
    [{ kind: "claude_config", since }, "bot|claude_config|2026-10-23T14:05:00.000Z"],
    [{ kind: "claude_failing", since, failures: 4 }, "bot|claude_failing|2026-10-23T14:05:00.000Z"],
    [{ kind: "monthly_limit", resetsOn: "2026-11-01" }, "bot|monthly_limit|2026-11-01"],
    [{ kind: "monthly_limit_near", share: 0.85, resetsOn: "2026-11-01" }, "bot|monthly_limit_near|2026-11-01"],
    [{ kind: "stuck_messages", count: 2 }, "bot|stuck_messages|2026-10-23"],
  ])("%o → %s (un id válido)", (alert, id) => {
    expect(botAlertNotificationId(alert, "2026-10-23")).toBe(id);
    expect(isNotificationId(id)).toBe(true);
  });

  it("si el problema se arregla y vuelve a pasar, es otra; lo que cambia mientras pasa (cuántas, qué parte del tope), no", () => {
    const later = new Date("2026-10-24T09:00:00.000Z");
    expect(botAlertNotificationId({ kind: "whatsapp_token", since: later, unsent: 1 }, "2026-10-24")).not.toBe(
      botAlertNotificationId({ kind: "whatsapp_token", since, unsent: 1 }, "2026-10-24"),
    );
    expect(botAlertNotificationId({ kind: "whatsapp_token", since, unsent: 9 }, "2026-10-24")).toBe(
      botAlertNotificationId({ kind: "whatsapp_token", since, unsent: 1 }, "2026-10-23"),
    );
    expect(botAlertNotificationId({ kind: "monthly_limit_near", share: 0.95, resetsOn: "2026-11-01" }, "2026-10-30")).toBe(
      botAlertNotificationId({ kind: "monthly_limit_near", share: 0.8, resetsOn: "2026-11-01" }, "2026-10-20"),
    );
    // Los mensajes sin procesar: mientras sigan, vuelve cada día.
    expect(botAlertNotificationId({ kind: "stuck_messages", count: 1 }, "2026-10-24")).toBe("bot|stuck_messages|2026-10-24");
  });
});

describe("unreadNotifications", () => {
  it("los avisos que no se marcaron como leídos, en el mismo orden y con su id", () => {
    const items = [item("gimnasio"), item("arriendo"), item("arriendo", "2026-09")];
    expect(unreadNotifications(items, new Set(["pago|2026-10|arriendo"]))).toEqual([
      { kind: "payment", id: "pago|2026-10|gimnasio", item: items[0] },
      { kind: "payment", id: "pago|2026-09|arriendo", item: items[2] },
    ]);
    expect(unreadNotifications([], new Set())).toEqual([]);
  });

  it("el recordatorio de registro va primero; leído, sale hasta el próximo hueco (otra fecha)", () => {
    const reminder = { since: "2026-10-16", days: 4, firstTime: false };
    expect(unreadNotifications([item("gimnasio")], new Set(), reminder).map((n) => [n.kind, n.id])).toEqual([
      ["reminder", "registro|2026-10-16"],
      ["payment", "pago|2026-10|gimnasio"],
    ]);
    expect(unreadNotifications([], new Set(["registro|2026-10-16"]), reminder)).toEqual([]);
    expect(unreadNotifications([], new Set(["registro|2026-10-16"]), { ...reminder, since: "2026-10-18" })).toHaveLength(1);
  });

  it("las alertas del bot van antes que todo, en su orden; leídas, salen", () => {
    const alert = (title: string): BotAlertView => ({ title, detail: null, action: "", warning: false });
    const bot = [
      { id: "bot|whatsapp_token|2026-10-23T14:05:00.000Z", alert: alert("El token") },
      { id: "bot|monthly_limit|2026-11-01", alert: alert("El tope") },
    ];
    const reminder = { since: "2026-10-16", days: 4, firstTime: false };
    expect(unreadNotifications([item("gimnasio")], new Set(), reminder, bot).map((n) => [n.kind, n.id])).toEqual([
      ["bot", "bot|whatsapp_token|2026-10-23T14:05:00.000Z"],
      ["bot", "bot|monthly_limit|2026-11-01"],
      ["reminder", "registro|2026-10-16"],
      ["payment", "pago|2026-10|gimnasio"],
    ]);
    expect(unreadNotifications([], new Set(["bot|monthly_limit|2026-11-01"]), null, bot)).toEqual([
      { kind: "bot", id: "bot|whatsapp_token|2026-10-23T14:05:00.000Z", alert: bot[0].alert },
    ]);
  });
});
