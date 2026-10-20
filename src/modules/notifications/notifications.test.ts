import { describe, expect, it } from "vitest";
import { NOTIFICATION_ID_MAX_LENGTH } from "@/db/schema";
import type { UpcomingItem } from "@/modules/reports/upcoming";
import { isNotificationId, NOTIFICATION_ID_MAX, paymentNotificationId, unreadNotifications } from "./notifications";

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

  it.each([["otro|2026-10|x"], ["pago|2026-13|x"], ["pago|octubre|x"], ["pago|2026-10|"], [`pago|2026-10|${"x".repeat(200)}`], [3], [null]])(
    "%j no es un id válido",
    (value) => {
      expect(isNotificationId(value)).toBe(false);
    },
  );

  it("el largo máximo es el mismo que acepta la base", () => {
    expect(NOTIFICATION_ID_MAX).toBe(NOTIFICATION_ID_MAX_LENGTH);
  });
});

describe("unreadNotifications", () => {
  it("los avisos que no se marcaron como leídos, en el mismo orden y con su id", () => {
    const items = [item("gimnasio"), item("arriendo"), item("arriendo", "2026-09")];
    expect(unreadNotifications(items, new Set(["pago|2026-10|arriendo"]))).toEqual([
      { id: "pago|2026-10|gimnasio", item: items[0] },
      { id: "pago|2026-09|arriendo", item: items[2] },
    ]);
    expect(unreadNotifications([], new Set())).toEqual([]);
  });
});
