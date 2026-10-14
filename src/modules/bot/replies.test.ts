import { describe, expect, it } from "vitest";
import { monthRange } from "@/lib/dates";
import { balanceReply, registeredReply, undoReply } from "./replies";

const range = monthRange(2026, 10);
const nbsp = (s: string) => s.replace(/\u00a0/g, " ");

describe("registeredReply", () => {
  it("confirma el egreso con categoría y balance del mes", () => {
    const text = registeredReply(
      [
        {
          type: "expense",
          amount: 500000,
          description: "Zapatos",
          category: "Ropa",
          occurredOn: "2026-10-13",
        },
      ],
      { today: "2026-10-13", currency: "COP", balance: 2700000, range },
    );
    expect(nbsp(text)).toBe(
      [
        "✅ Egreso registrado: *Zapatos* — $ 500.000 (Ropa)",
        "",
        "Balance de octubre: *$ 2.700.000*",
        "_Escribe *deshacer* si me equivoqué._",
      ].join("\n"),
    );
  });

  it("muestra la fecha cuando no es hoy y lista varios movimientos", () => {
    const text = nbsp(
      registeredReply(
        [
          {
            type: "expense",
            amount: 30000,
            description: "Gasolina",
            category: "Transporte",
            occurredOn: "2026-10-12",
          },
          {
            type: "income",
            amount: 100000,
            description: "Venta",
            category: null,
            occurredOn: "2026-10-13",
          },
        ],
        { today: "2026-10-13", currency: "COP", balance: 70000, range },
      ),
    );
    expect(text).toContain("Egreso registrado: *Gasolina* — $ 30.000 (Transporte · 12 de oct)");
    expect(text).toContain("Ingreso registrado: *Venta* — $ 100.000\n");
  });
});

describe("balanceReply", () => {
  it("resume el mes", () => {
    expect(
      nbsp(
        balanceReply(
          { income: 3200000, expense: 500000, balance: 2700000, count: 2 },
          { currency: "COP", range },
        ),
      ),
    ).toBe(
      [
        "📊 *Octubre de 2026*",
        "Ingresos: $ 3.200.000",
        "Egresos: $ 500.000",
        "Balance: *$ 2.700.000*",
      ].join("\n"),
    );
  });

  it("invita a registrar si no hay movimientos", () => {
    expect(
      balanceReply({ income: 0, expense: 0, balance: 0, count: 0 }, { currency: "COP", range }),
    ).toContain("Aún no tienes movimientos en octubre de 2026");
  });
});

describe("undoReply", () => {
  it("informa si no hay nada que deshacer", () => {
    expect(undoReply([], "COP")).toContain("No encontré");
  });
});
