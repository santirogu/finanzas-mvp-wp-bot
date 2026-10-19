import { describe, expect, it } from "vitest";
import { balanceMonth, parseCommand, reportYear } from "./commands";

const balanceOf = (text: string) => {
  const command = parseCommand(text);
  return command?.kind === "command" && command.command === "balance" ? (command.period ?? "este mes") : null;
};

describe("parseCommand · balance de otro mes", () => {
  it.each([
    ["balance septiembre", { month: 9 }],
    ["Balance de Septiembre", { month: 9 }],
    ["saldo agosto", { month: 8 }],
    ["resumen de marzo", { month: 3 }],
    ["balance del mes de enero", { month: 1 }],
    ["mi balance de diciembre", { month: 12 }],
    ["balance del febrero", { month: 2 }],
    ["balance sept", { month: 9 }],
    ["balance sep", { month: 9 }],
    ["balance setiembre", { month: 9 }],
    ["balance set", { month: 9 }],
    ["balance ene", { month: 1 }],
    ["balance feb", { month: 2 }],
    ["balance abr", { month: 4 }],
    ["balance may", { month: 5 }],
    ["balance mayo", { month: 5 }],
    ["balance jun", { month: 6 }],
    ["balance julio", { month: 7 }],
    ["balance jul", { month: 7 }],
    ["balance ago", { month: 8 }],
    ["balance oct", { month: 10 }],
    ["balance octubre", { month: 10 }],
    ["balance nov", { month: 11 }],
    ["balance noviembre", { month: 11 }],
    ["balance dic", { month: 12 }],
    ["balance abril", { month: 4 }],
    ["balance junio", { month: 6 }],
    ["balance marzo", { month: 3 }],
    ["balance mar", { month: 3 }],
    ["balance enero", { month: 1 }],
    ["balance febrero", { month: 2 }],
    ["balance septiembre 2025", { month: 9, year: 2025 }],
    ["balance de septiembre de 2025", { month: 9, year: 2025 }],
    ["saldo agosto del 2024", { month: 8, year: 2024 }],
    ["¿Cuánto gasté en septiembre?", { month: 9 }],
    ["cuanto llevo en agosto de 2025", { month: 8, year: 2025 }],
    ["cuánto he gastado en el mes de julio", { month: 7 }],
    ["cuanto llevo gastado en mayo", { month: 5 }],
    ["cuanto tengo en junio", { month: 6 }],
    ["balance mes pasado", "previous"],
    ["Balance del mes pasado", "previous"],
    ["saldo del mes anterior", "previous"],
    ["resumen de mes anterior", "previous"],
    ["¿Cuánto gasté el mes pasado?", "previous"],
    ["cuanto llevo en el mes anterior", "previous"],
    // Otras formas de preguntar (la primera, tal cual llegó por WhatsApp).
    ["Cuántos fueron mis ingresos en Septiembre?", { month: 9 }],
    ["¿cuánto fueron mis gastos en agosto?", { month: 8 }],
    ["cuantos son los egresos de julio de 2025", { month: 7, year: 2025 }],
    ["cuantas fueron las salidas en junio", null],
    ["¿Cuánto gané en septiembre?", { month: 9 }],
    ["cuanto recibi en agosto", { month: 8 }],
    ["cuanto me entro en marzo", { month: 3 }],
    ["cuanto me pagaron en mayo", { month: 5 }],
    ["cuanto he ganado en el mes de abril", { month: 4 }],
    ["cuanto llevo ganado en junio", { month: 6 }],
    ["cuantos gastos tuve en septiembre", { month: 9 }],
    ["cuantos ingresos hubo en octubre", { month: 10 }],
    ["mis ingresos de septiembre", { month: 9 }],
    ["Mis gastos de agosto del 2025", { month: 8, year: 2025 }],
    ["egresos en enero", { month: 1 }],
    ["¿Cómo me fue en septiembre?", { month: 9 }],
    ["gastos del mes pasado", "previous"],
    ["¿cuánto gané el mes pasado?", "previous"],
    ["cuantos fueron mis ingresos el mes anterior", "previous"],
    ["como me fue el mes pasado", "previous"],
  ])("%j → %j", (text, period) => {
    expect(balanceOf(text)).toEqual(period);
  });

  it("el balance de siempre sigue siendo el del mes actual (sin periodo)", () => {
    expect(parseCommand("balance")).toEqual({ kind: "command", command: "balance" });
    expect(parseCommand("cuánto llevo este mes")).toEqual({ kind: "command", command: "balance" });
    expect(parseCommand("¿Cuánto llevo?")).toEqual({ kind: "command", command: "balance" });
  });

  it.each([
    "¿Cuánto gané este mes?",
    "cuantos fueron mis ingresos",
    "cuantos son mis gastos este mes",
    "mis gastos del mes",
    "ingresos este mes",
    "¿cómo me va?",
    "como me va en este mes",
    "cuanto me entro",
  ])("%j es el balance de este mes", (text) => {
    expect(parseCommand(text)).toEqual({ kind: "command", command: "balance" });
  });

  it.each([
    "mis gastos",
    "ingresos",
    "gastos de mercado",
    "mis ingresos de la quincena",
    "cuanto gane en la rifa",
    "como me fue en el trabajo",
    "cuantos fueron mis gastos en ropa",
    "me pagaron en septiembre 500 mil",
    "gastos de septiembre en mercado",
    "dime cuanto gane este mes",
    "cuanto gane este mes en ventas",
  ])("%j no es un balance (lo interpreta la IA)", (text) => {
    expect(parseCommand(text)).toBeNull();
  });

  it("los comandos van solos: dentro de una frase, no", () => {
    expect(parseCommand("dime cuanto llevo")).toBeNull();
    expect(parseCommand("necesito ayuda")).toBeNull();
  });

  it.each([
    "balance de la tarjeta",
    "balance septiembre por favor",
    "balance septiembre 25",
    "balance mes",
    "balance mes siguiente",
    "cuanto llevo gastado en ropa",
    "cuanto gaste en mercado",
    "gaste 20 mil en septiembre",
    "septiembre",
    "balance martes",
    "balance mayor",
    "balance constructor",
    "cuanto gaste en marte",
    "balance de enero2025",
    "ver balance mes pasado",
    "balance mes pasado por favor",
    "dime cuanto gaste el mes pasado",
    "cuanto gaste el mes pasado en ropa",
  ])("%j no es un balance de otro mes (lo interpreta la IA)", (text) => {
    expect(balanceOf(text)).toBeNull();
  });
});

describe("balanceMonth", () => {
  const october = { year: 2026, month: 10 };

  it("sin periodo, el mes actual; el mes pasado, el anterior (cruzando de año)", () => {
    expect(balanceMonth(undefined, october)).toEqual({ month: { year: 2026, month: 10 } });
    expect(balanceMonth("previous", october)).toEqual({ month: { year: 2026, month: 9 } });
    expect(balanceMonth("previous", { year: 2027, month: 1 })).toEqual({ month: { year: 2026, month: 12 } });
  });

  it("sin año, el último que ya pasó con ese nombre (este, si es el actual)", () => {
    expect(balanceMonth({ month: 9 }, october)).toEqual({ month: { year: 2026, month: 9 } });
    expect(balanceMonth({ month: 10 }, october)).toEqual({ month: { year: 2026, month: 10 } });
    expect(balanceMonth({ month: 11 }, october)).toEqual({ month: { year: 2025, month: 11 } });
    expect(balanceMonth({ month: 1 }, october)).toEqual({ month: { year: 2026, month: 1 } });
  });

  it("antes del 2000 no hay movimientos (y un año como 0000 ni siquiera es una fecha)", () => {
    expect(balanceMonth({ month: 12, year: 1999 }, october)).toEqual({ tooOld: true });
    expect(balanceMonth({ month: 1, year: 0 }, october)).toEqual({ tooOld: true });
    expect(balanceMonth({ month: 1, year: 2000 }, october)).toEqual({ month: { year: 2000, month: 1 } });
  });

  it("con año, ese; si todavía no llega, lo dice", () => {
    expect(balanceMonth({ month: 9, year: 2025 }, october)).toEqual({ month: { year: 2025, month: 9 } });
    expect(balanceMonth({ month: 10, year: 2026 }, october)).toEqual({ month: { year: 2026, month: 10 } });
    expect(balanceMonth({ month: 12, year: 2026 }, october)).toEqual({ future: { year: 2026, month: 12 } });
    expect(balanceMonth({ month: 1, year: 2027 }, october)).toEqual({ future: { year: 2027, month: 1 } });
  });
});

describe("parseCommand · reporte", () => {
  it.each([
    ["reporte", {}],
    ["Reporte", {}],
    ["informe", {}],
    ["mi reporte", {}],
    ["el informe", {}],
    ["reporte de los últimos 12 meses", {}],
    ["reporte ultimos 12 meses", {}],
    ["¿Reporte?", {}],
    ["reporte 2025", { period: { year: 2025 } }],
    ["informe del 2025", { period: { year: 2025 } }],
    ["reporte de 2024", { period: { year: 2024 } }],
    ["reporte año 2025", { period: { year: 2025 } }],
    ["reporte del año 2025", { period: { year: 2025 } }],
    ["reporte 99", { period: { year: 99 } }],
    ["reporte del año", { period: "this-year" }],
    ["Reporte de este año", { period: "this-year" }],
    ["reporte este año", { period: "this-year" }],
    ["informe anual", { period: "this-year" }],
  ])("%s", (text, expected) => {
    expect(parseCommand(text)).toEqual({ kind: "command", command: "report", ...expected });
  });

  it.each(["reportes", "reporte de gastos", "reporte 20255", "reporte septiembre", "informe: gasté 20 mil", "reporte del mes", "mi reporte anual 2025"])(
    "%s no es el comando (va a Claude)",
    (text) => {
      expect(parseCommand(text)).toBeNull();
    },
  );

  it("no se confunde con el balance", () => {
    expect(parseCommand("resumen")).toEqual({ kind: "command", command: "balance" });
  });
});

describe("reportYear", () => {
  const october = { year: 2026, month: 10 };

  it("sin año, los últimos 12 meses (sin ?periodo=)", () => {
    expect(reportYear(undefined, october)).toEqual({});
  });

  it("el año pedido, o el actual", () => {
    expect(reportYear({ year: 2025 }, october)).toEqual({ id: "2025" });
    expect(reportYear({ year: 2026 }, october)).toEqual({ id: "2026" });
    expect(reportYear("this-year", october)).toEqual({ id: "2026" });
    expect(reportYear({ year: 2000 }, october)).toEqual({ id: "2000" });
  });

  it("un año que todavía no llega, o de antes del 2000", () => {
    expect(reportYear({ year: 2027 }, october)).toEqual({ future: 2027 });
    expect(reportYear({ year: 1999 }, october)).toEqual({ tooOld: true });
    expect(reportYear({ year: 99 }, october)).toEqual({ tooOld: true });
  });
});
