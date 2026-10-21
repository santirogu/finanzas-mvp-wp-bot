import { describe, expect, it } from "vitest";
import { monthRange } from "@/lib/dates";
import {
  aiMonthlyLimitReply,
  aiPausedReply,
  aiRateLimitedReply,
  aiUnavailableReply,
  balanceReply,
  errorReply,
  futureMonthReply,
  futureYearReply,
  REPORT_CATEGORIES,
  reportReply,
  tooOldYearReply,
  tooOldMonthReply,
  helpReply,
  linkedReply,
  linkInvalidReply,
  linkRateLimitedReply,
  notLinkedReply,
  registeredReply,
  suspendedReply,
  tooManyTransactionsReply,
  undoReply,
  unsupportedTypeReply,
} from "./replies";
import { CONTACT_EMAIL } from "@/lib/contact";
import type { CategoryReport } from "@/modules/reports/categories";
import { reportPeriod } from "@/modules/reports/period";
import type { RecurringReport } from "@/modules/reports/recurring";
import type { PeriodSummary } from "@/modules/reports/summary";

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
        "✅ Egreso Anotado: *Zapatos* — $500.000,00 (Ropa)",
        "",
        "Balance de octubre: *$2.700.000,00*",
        "_Escribe *deshacer* si me equivoqué._",
      ].join("\n"),
    );
  });

  it("confirma con los centavos que se escribieron", () => {
    const text = registeredReply(
      [{ type: "expense", amount: 25900.5, description: "Almuerzo", category: "Alimentación", occurredOn: "2026-10-13" }],
      { today: "2026-10-13", currency: "COP", balance: -25900.5, range },
    );
    expect(text).toContain("✅ Egreso Anotado: *Almuerzo* — $25.900,50 (Alimentación)");
    expect(text).toContain("Balance de octubre: *−$25.900,50*");
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
    expect(text).toContain("Egreso Anotado: *Gasolina* — $30.000,00 (Transporte · 12 de oct.)");
    expect(text).toContain("Ingreso Anotado: *Venta* — $100.000,00\n");
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
        "Ingresos: $3.200.000,00",
        "Egresos: $500.000,00",
        "Balance: *$2.700.000,00*",
      ].join("\n"),
    );
  });

  it("con centavos", () => {
    expect(
      balanceReply({ income: 100000.5, expense: 45900.25, balance: 54100.25, count: 2 }, { currency: "COP", range }),
    ).toContain("Ingresos: $100.000,50\nEgresos: $45.900,25\nBalance: *$54.100,25*");
  });

  it("invita a registrar si no hay movimientos", () => {
    expect(
      balanceReply({ income: 0, expense: 0, balance: 0, count: 0 }, { currency: "COP", range }),
    ).toContain("Aún no tienes movimientos en octubre de 2026");
  });

  const september = { year: 2026, month: 9 };
  const summary = (balance: number, count = 3) => ({ income: balance > 0 ? balance : 0, expense: balance < 0 ? -balance : 0, balance, count });

  it("con el mes anterior, una línea más con cómo cambió el balance (como en el Resumen)", () => {
    const up = balanceReply(summary(2940627.25), { currency: "COP", range, previous: { month: september, summary: summary(1136648.5) } });
    expect(nbsp(up).split("\n").at(-1)).toBe("_↗ $1.803.978,75 más que septiembre_");
    const down = balanceReply(summary(100000), { currency: "COP", range, previous: { month: september, summary: summary(250000) } });
    expect(nbsp(down).split("\n").at(-1)).toBe("_↘ $150.000,00 menos que septiembre_");
    const same = balanceReply(summary(100000), { currency: "COP", range, previous: { month: september, summary: summary(100000) } });
    expect(nbsp(same).split("\n").at(-1)).toBe("_Igual que septiembre_");
  });

  it("sin movimientos el mes anterior, no compara (y el título dice el mes pedido)", () => {
    const reply = balanceReply(summary(100000), {
      currency: "COP",
      range: { year: 2025, month: 12 },
      previous: { month: { year: 2025, month: 11 }, summary: summary(0, 0) },
    });
    expect(reply.split("\n")).toHaveLength(4);
    expect(reply).toContain("📊 *Diciembre de 2025*");
  });
});

describe("tooOldMonthReply", () => {
  it("dice desde cuándo hay balances y cómo pedir otro", () => {
    expect(tooOldMonthReply).toBe(
      "Solo puedo darte balances desde enero de 2000. Prueba con *balance* (este mes) o *balance mes pasado*.",
    );
  });
});

describe("futureMonthReply", () => {
  it("dice que el mes todavía no llega y cómo pedir otro", () => {
    expect(futureMonthReply({ year: 2026, month: 12 })).toBe(
      "Diciembre de 2026 todavía no llega 🙂. Prueba con *balance* (este mes) o *balance mes pasado*.",
    );
  });
});

describe("undoReply", () => {
  it("informa si no hay nada que deshacer", () => {
    expect(undoReply([], "COP")).toContain("No encontré");
  });
});

describe("mensajes de vinculación y ayuda", () => {
  it("saluda por el primer nombre o sin nombre", () => {
    // El vocativo va entre comas (Ortografía de la RAE).
    expect(helpReply("Ana Pérez")).toMatch(/^Hola, Ana 👋\n/);
    expect(helpReply()).toMatch(/^Hola 👋\n/);
    expect(linkedReply("Ana Pérez")).toContain("¡Listo, Ana!");
    expect(linkedReply("")).toContain("¡Listo!");
  });

  it("indica dónde vincular el número, que hay que enviar VINCULAR con el código, y dónde crear la cuenta", () => {
    expect(notLinkedReply("https://finanzas.test")).toBe(
      [
        "Hola 👋",
        "Este número aún no está vinculado a una cuenta. Entra a https://finanzas.test/cuenta (*Mi cuenta*), toca *Conectar WhatsApp* y envíame el mensaje que te aparece: *VINCULAR* y el código.",
        "",
        "Si no tienes cuenta, créala en https://finanzas.test/registro.",
      ].join("\n"),
    );
  });

  it("a una cuenta suspendida le dice que no registra nada ni responde, y cómo escribirnos, sin el motivo", () => {
    expect(suspendedReply).toBe(
      `Tu cuenta está suspendida, así que no puedo registrar movimientos ni responder tus consultas. Si crees que es un error, escríbenos a ${CONTACT_EMAIL}.`,
    );
  });

  it("lista lo que se deshizo", () => {
    expect(
      undoReply([{ description: "Café", amount: 6500, type: "expense" }], "COP").replace(
        /\u00a0/g,
        " ",
      ),
    ).toBe("Listo, eliminé:\n🗑️ Café — $6.500,00");
  });

  it("lista lo que se deshizo, con sus centavos", () => {
    expect(undoReply([{ description: "Café", amount: 6500.5, type: "expense" }], "COP")).toBe(
      "Listo, eliminé:\n🗑️ Café — $6.500,50",
    );
  });
});

describe("textos fijos del bot", () => {
  // Protege los textos que ve el usuario: un cambio accidental (o un texto vacío) rompe esta prueba.
  it("ayuda", () => {
    expect(helpReply("Ana Pérez")).toBe(
      [
        "Hola, Ana 👋",
        "Escríbeme tus ingresos y gastos como se los contarías a alguien:",
        "",
        "• _me compré unos zapatos de $500.000_",
        "• _almuerzo 25 mil y taxi 12 mil_",
        "• _me pagaron la quincena 2.100.000_",
        "",
        "También entiendo:",
        "• *balance* — cómo vas este mes",
        "• *balance septiembre* o *balance mes pasado* — otro mes",
        "• *reporte* — tus últimos 12 meses (o *reporte 2025*, un año)",
        "• *deshacer* — borra lo último que registré",
      ].join("\n"),
    );
  });

  it("errores y vinculación", () => {
    expect(linkInvalidReply).toBe("Ese código no es válido o ya venció. Pide otro en *Mi cuenta*: toca *Conectar WhatsApp*.");
    expect(linkRateLimitedReply).toBe("Recibí demasiados códigos equivocados desde este número. Espera una hora y vuelve a intentarlo.");
    expect(unsupportedTypeReply).toBe("Por ahora solo entiendo mensajes de texto ✍️");
    // El error puede llegar después de guardar: que revise antes de enviarlo de nuevo.
    expect(errorReply).toBe("Tuve un problema con tu mensaje 😕. Revisa en la web si quedó y, si no, envíamelo de nuevo en un momento.");
    expect(aiUnavailableReply).toBe(
      "No registré tu mensaje: por ahora solo entiendo *balance*, *reporte*, *deshacer* y *ayuda*. Muy pronto podrás registrar tus movimientos escribiendo como hablas ✍️.",
    );
  });

  it("con Claude en pausa (/admin/bot): primero que no lo registró, después dónde registrarlo y los comandos que siguen", () => {
    expect(aiPausedReply("https://finanzas.app")).toBe(
      "No registré tu mensaje: por ahora no puedo entender mensajes escritos libremente 🛠️. Regístralo en la web, en *Egresos* o *Ingresos*: https://finanzas.app/egresos. Siguen funcionando *balance*, *reporte*, *deshacer* y *ayuda*.",
    );
  });

  it("con el tope mensual de tokens alcanzado: lo mismo que en pausa", () => {
    expect(aiMonthlyLimitReply("https://finanzas.app")).toBe(
      "No registré tu mensaje: este mes ya usé todo mi cupo para entender mensajes escritos libremente 🛠️. Regístralo en la web, en *Egresos* o *Ingresos*: https://finanzas.app/egresos. Siguen funcionando *balance*, *reporte*, *deshacer* y *ayuda*.",
    );
  });

  it("límites del bot: primero que no registró nada", () => {
    expect(aiRateLimitedReply).toBe(
      "No registré este mensaje: recibí muchos en poco tiempo. Espera un rato y envíamelo de nuevo. Mientras tanto, puedes escribir *balance*, *reporte*, *deshacer* o *ayuda*, o registrarlo en la web.",
    );
    expect(tooManyTransactionsReply(20)).toBe("No registré ninguno: tu mensaje trae más de 20 movimientos. Envíamelos en varios mensajes, hasta 20 en cada uno.");
  });

  it("los mensajes que no registran nada lo dicen al empezar", () => {
    for (const reply of [aiRateLimitedReply, tooManyTransactionsReply(20), aiPausedReply("x"), aiMonthlyLimitReply("x"), aiUnavailableReply]) {
      expect(reply).toMatch(/^No registré /);
    }
  });
});

describe("reportReply", () => {
  const october = { year: 2026, month: 10 };
  const ctx = { currency: "COP", appUrl: "https://finanzas.app" };
  const summary: PeriodSummary = {
    income: 33350000,
    expense: 10977000,
    balance: 22373000,
    saved: "67",
    averageExpense: { amount: 3748000, months: 3, withoutCurrent: true },
    topMonth: { month: october, expense: 7229000 },
  };
  const row = (emoji: string, name: string, total: number) => ({ emoji, name, total, share: 0, color: 0, change: null });
  const categories: CategoryReport = {
    total: 10977000,
    compared: null,
    averaged: [],
    rows: [row("🏠", "Vivienda", 7000000), row("💳", "Deudas", 1500000), row("📚", "Educación", 1200000), row("🍽️", "Alimentación", 1277000)],
  };
  const recurring: RecurringReport = {
    items: [{ key: "arriendo", description: "Arriendo", emoji: "🏠", amount: 1800000, months: 4, origin: "auto" }],
    total: 1800000.5,
    removed: [],
    candidates: [],
  };

  it("las cifras del período, las categorías que más sumaron, los gastos fijos y el enlace", () => {
    expect(reportReply({ summary, categories, recurring }, reportPeriod(undefined, october), ctx)).toBe(
      [
        "📊 *Reporte de noviembre de 2025 a octubre de 2026*",
        "Ingresos: $33.350.000,00",
        "Egresos: $10.977.000,00",
        "Balance: *$22.373.000,00* (ahorraste el 67\u00a0%)",
        "Gasto promedio por mes: $3.748.000,00",
        "Mes de más gasto: octubre de 2026 ($7.229.000,00)",
        "En qué se te fue: 🏠 Vivienda 64\u00a0% · 💳 Deudas 14\u00a0% · 📚 Educación 11\u00a0%",
        "Gastos fijos: $1.800.000,50 al mes",
        "",
        "Más detalle en *Reportes*: https://finanzas.app/reportes",
      ].join("\n"),
    );
  });

  it(`nombra hasta ${REPORT_CATEGORIES} categorías, las que llegan`, () => {
    const two = { ...categories, rows: categories.rows.slice(0, 1) };
    expect(reportReply({ summary, categories: two, recurring }, reportPeriod(undefined, october), ctx)).toContain(
      "En qué se te fue: 🏠 Vivienda 64\u00a0%\n",
    );
  });

  it("de un año, con su enlace; si gastó más de lo que ganó, lo dice", () => {
    const overspent = { ...summary, balance: -500, saved: "overspent" as const };
    const reply = reportReply({ summary: overspent, categories, recurring }, reportPeriod("2025", october), ctx);
    expect(reply).toMatch(/^📊 \*Reporte de enero a diciembre de 2025\*\n/);
    expect(reply).toContain("Balance: *−$500,00* (gastaste más de lo que ganaste)");
    expect(reply).toMatch(/Más detalle en \*Reportes\*: https:\/\/finanzas\.app\/reportes\?periodo=2025$/);
  });

  it("de un solo mes (el año en curso en enero), con su artículo", () => {
    const reply = reportReply({ summary, categories, recurring }, reportPeriod("2026", { year: 2026, month: 1 }), ctx);
    expect(reply).toMatch(/^📊 \*Reporte de enero de 2026\*\n/);
  });

  it("sin promedio, sin mes de más gasto, sin categorías ni fijos, y con el balance en cero: solo lo que hay", () => {
    const bare = { ...summary, expense: 0, balance: 33350000, saved: null, averageExpense: null, topMonth: null };
    expect(
      reportReply({ summary: bare, categories: { ...categories, rows: [] }, recurring: { items: [], total: 0 } }, reportPeriod(undefined, october), ctx),
    ).toBe(
      [
        "📊 *Reporte de noviembre de 2025 a octubre de 2026*",
        "Ingresos: $33.350.000,00",
        "Egresos: $0,00",
        "Balance: *$33.350.000,00*",
        "",
        "Más detalle en *Reportes*: https://finanzas.app/reportes",
      ].join("\n"),
    );
  });

  it("sin movimientos en el período, lo dice (con su artículo si es un solo mes)", () => {
    const empty = { ...summary, income: 0, expense: 0, balance: 0, saved: null, averageExpense: null, topMonth: null };
    const none = { summary: empty, categories: { ...categories, rows: [], total: 0 }, recurring: { items: [], total: 0 } };
    expect(reportReply(none, reportPeriod(undefined, october), ctx)).toBe(
      "No tienes movimientos de noviembre de 2025 a octubre de 2026. Escríbeme algo como “gasté 20 mil en almuerzo” y aquí verás cómo te va.",
    );
    expect(reportReply(none, reportPeriod("2026", { year: 2026, month: 1 }), ctx)).toMatch(/^No tienes movimientos en enero de 2026\./);
    // Con solo ingresos (o solo egresos) ya hay reporte.
    expect(reportReply({ ...none, summary: { ...empty, income: 1 } }, reportPeriod(undefined, october), ctx)).toMatch(/^📊/);
    expect(reportReply({ ...none, summary: { ...empty, expense: 1 } }, reportPeriod(undefined, october), ctx)).toMatch(/^📊/);
  });

  it("un año futuro o de antes del 2000", () => {
    expect(futureYearReply(2027)).toBe("2027 todavía no llega 🙂. Prueba con *reporte* (los últimos 12 meses) o *reporte* y un año que ya pasó.");
    expect(tooOldYearReply).toBe("Solo puedo darte reportes desde el 2000. Prueba con *reporte* (los últimos 12 meses) o *reporte 2025*.");
  });
});
