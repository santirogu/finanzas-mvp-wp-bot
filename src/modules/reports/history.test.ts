import { describe, expect, it } from "vitest";
import { FIXED_NOTE_MAX_LENGTH } from "@/db/schema";
import { changeDirection, fixedHistories, type HistoryMonth, lastChange, NOTE_MAX_LENGTH, pctLabel } from "./history";

const row = (month: string, description: string, total: number, first = `${month}-05`): HistoryMonth => ({ month, description, total, first });

describe("fixedHistories", () => {
  it("el primer pago y cada mes en que el valor cambió, del más reciente al más antiguo", () => {
    const histories = fixedHistories(
      [
        row("2025-01", "Netflix", 41900),
        row("2025-02", "Netflix", 41900),
        row("2025-06", "Netflix", 44900),
        row("2025-07", "Netflix", 44900),
        row("2026-03", "Netflix", 49900, "2026-03-07"),
      ],
      ["netflix"],
    );
    expect(histories.get("netflix")).toEqual([
      { month: "2026-03", date: "2026-03-07", amount: 49900, previous: 44900, diff: 5000, pct: 11 },
      { month: "2025-06", date: "2025-06-05", amount: 44900, previous: 41900, diff: 3000, pct: 7 },
      { month: "2025-01", date: "2025-01-05", amount: 41900, previous: null, diff: null, pct: null },
    ]);
  });

  it("si baja, la diferencia y el porcentaje son negativos; con centavos, exactos", () => {
    const histories = fixedHistories([row("2026-08", "Claro", 130000.3), row("2026-09", "Claro", 125749.2)], ["claro"]);
    expect(histories.get("claro")![0]).toMatchObject({ previous: 130000.3, amount: 125749.2, diff: -4251.1, pct: -3 });
  });

  it("los meses sin pago no cuentan: se compara con el último mes en que apareció", () => {
    const histories = fixedHistories([row("2026-01", "Seguro", 950000), row("2026-05", "Seguro", 950000), row("2026-09", "Seguro", 990000)], [
      "seguro",
    ]);
    expect(histories.get("seguro")!.map((e) => [e.month, e.previous])).toEqual([
      ["2026-09", 950000],
      ["2026-01", null],
    ]);
  });

  it("las escrituras distintas del mismo gasto se suman en el mes, con el primer pago de todas", () => {
    const histories = fixedHistories(
      [
        row("2026-08", "Suscripción", 20000, "2026-08-10"),
        row("2026-08", "suscripcion", 24900, "2026-08-02"),
        // Aquí el primer pago llega antes que el otro.
        row("2026-09", "Suscripcion ", 0.2, "2026-09-03"),
        row("2026-09", "SUSCRIPCIÓN", 0.1, "2026-09-20"),
      ],
      ["suscripcion"],
    );
    expect(histories.get("suscripcion")).toEqual([
      { month: "2026-09", date: "2026-09-03", amount: 0.3, previous: 44900, diff: -44899.7, pct: -100 },
      { month: "2026-08", date: "2026-08-02", amount: 44900, previous: null, diff: null, pct: null },
    ]);
  });

  it("solo de los gastos pedidos; uno sin movimientos no tiene historial", () => {
    const histories = fixedHistories([row("2026-09", "Mercado", 600000), row("2026-09", "Arriendo", 1800000)], ["arriendo", "netflix"]);
    expect([...histories.keys()]).toEqual(["arriendo"]);
    expect(histories.get("arriendo")).toHaveLength(1);
  });

  it("los meses pueden llegar en cualquier orden", () => {
    const histories = fixedHistories([row("2026-09", "Gym", 120000), row("2026-07", "Gym", 100000), row("2026-08", "Gym", 100000)], ["gym"]);
    expect(histories.get("gym")!.map((e) => [e.month, e.amount, e.previous])).toEqual([
      ["2026-09", 120000, 100000],
      ["2026-07", 100000, null],
    ]);
  });
});

describe("pctLabel y changeDirection", () => {
  it("el porcentaje sin signo, o <1% si redondeado da cero", () => {
    expect(pctLabel(11)).toBe("11%");
    expect(pctLabel(-3)).toBe("3%");
    expect(pctLabel(0)).toBe("<1%");
  });

  it("sube o baja según la diferencia", () => {
    expect(changeDirection(5000)).toBe("up");
    expect(changeDirection(-0.01)).toBe("down");
  });
});

describe("lastChange", () => {
  it("el cambio más reciente, no el primer pago; null si el valor nunca cambió", () => {
    const histories = fixedHistories([row("2026-01", "Gym", 100000), row("2026-05", "Gym", 120000), row("2026-09", "Gym", 130000)], ["gym"]);
    expect(lastChange(histories.get("gym")!)).toMatchObject({ month: "2026-09", previous: 120000 });
    expect(lastChange(fixedHistories([row("2026-01", "Gym", 100000)], ["gym"]).get("gym")!)).toBeNull();
    expect(lastChange([])).toBeNull();
  });
});

it("el largo máximo de una nota es el mismo de la base", () => {
  expect(NOTE_MAX_LENGTH).toBe(FIXED_NOTE_MAX_LENGTH);
});
