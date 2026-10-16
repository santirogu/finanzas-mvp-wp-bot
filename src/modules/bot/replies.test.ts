import { describe, expect, it } from "vitest";
import { monthRange } from "@/lib/dates";
import {
  aiRateLimitedReply,
  aiUnavailableReply,
  balanceReply,
  errorReply,
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
        "✅ Egreso registrado: *Zapatos* — $500.000,00 (Ropa)",
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
    expect(text).toContain("✅ Egreso registrado: *Almuerzo* — $25.900,50 (Alimentación)");
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
    expect(text).toContain("Egreso registrado: *Gasolina* — $30.000,00 (Transporte · 12 de oct)");
    expect(text).toContain("Ingreso registrado: *Venta* — $100.000,00\n");
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
});

describe("undoReply", () => {
  it("informa si no hay nada que deshacer", () => {
    expect(undoReply([], "COP")).toContain("No encontré");
  });
});

describe("mensajes de vinculación y ayuda", () => {
  it("saluda por el primer nombre o sin nombre", () => {
    expect(helpReply("Ana Pérez")).toMatch(/^Hola Ana 👋/);
    expect(helpReply()).toMatch(/^Hola 👋/);
    expect(linkedReply("Ana Pérez")).toContain("¡Listo, Ana!");
    expect(linkedReply("")).toContain("¡Listo!");
  });

  it("indica dónde vincular el número", () => {
    expect(notLinkedReply("https://finanzas.test")).toContain("https://finanzas.test/dashboard");
  });

  it("a una cuenta suspendida le dice que no registra nada y cómo escribirnos, sin el motivo", () => {
    expect(suspendedReply).toBe(
      `Tu cuenta está suspendida, así que no puedo registrar movimientos. Si crees que es un error, escríbenos a ${CONTACT_EMAIL}.`,
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
        "Hola Ana 👋 Escríbeme tus ingresos y gastos como se los contarías a alguien:",
        "",
        "• _me compré unos zapatos de $500.000_",
        "• _almuerzo 25 mil y taxi 12 mil_",
        "• _me pagaron la quincena 2.100.000_",
        "",
        "También entiendo:",
        "• *balance* — cómo vas este mes",
        "• *deshacer* — borra el último registro",
      ].join("\n"),
    );
  });

  it("errores y vinculación", () => {
    expect(linkInvalidReply).toBe(
      "Ese código no es válido o ya venció. Genera uno nuevo en el dashboard.",
    );
    expect(linkRateLimitedReply).toBe(
      "Demasiados intentos fallidos. Espera una hora antes de volver a intentar.",
    );
    expect(unsupportedTypeReply).toBe("Por ahora solo entiendo mensajes de texto ✍️");
    expect(errorReply).toBe(
      "Tuve un problema procesando tu mensaje 😕 Intenta de nuevo en un momento.",
    );
    expect(aiUnavailableReply).toBe(
      "Por ahora solo entiendo *balance*, *deshacer* y *ayuda*. Muy pronto podrás registrar gastos escribiendo normal ✍️",
    );
  });

  it("límites del bot", () => {
    expect(aiRateLimitedReply).toBe(
      "Recibí muchos mensajes en poco tiempo. Para cuidar el servicio, espera un rato antes de registrar más. Mientras tanto puedes escribir *balance* o *deshacer*, o usar la web.",
    );
    expect(tooManyTransactionsReply(20)).toBe(
      "Son muchos movimientos en un solo mensaje. Envíame máximo 20 por mensaje y los registro.",
    );
  });
});
