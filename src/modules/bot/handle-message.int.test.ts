import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  botSetting,
  category,
  transaction,
  user as userTable,
  whatsappLink,
  whatsappLinkCode,
  whatsappMessage,
} from "@/db/schema";
import { formatMonthLabel, formatMonthName, monthOf, monthParam, sameDayIn, shiftMonth, todayInTimezone } from "@/lib/dates";
import { createLinkCode } from "@/modules/whatsapp/link";
import {
  activeTransactions,
  capturingSender,
  createUser,
  fakeExtractor,
  incoming,
  loggedMessage,
} from "../../../test/integration/factories";
import type { ExtractionInput } from "./claude-extractor";
import { handleIncomingMessage } from "./handle-message";
import * as replies from "./replies";

const PHONE = "573001112233";
const APP_URL = "https://app.test";

async function linkedUser(phone = PHONE, name = "Ana Pérez") {
  const user = await createUser({ name });
  await db.insert(whatsappLink).values({ userId: user.id, phone });
  return user;
}

function deps(extractor = fakeExtractor([]), sender = capturingSender()) {
  return { deps: { extractor, send: sender.send, appUrl: APP_URL }, sender, extractor };
}

describe("handleIncomingMessage · vinculación", () => {
  it("a un número sin vincular le explica cómo hacerlo, sin llamar a la IA", async () => {
    const { deps: d, sender, extractor } = deps();
    const msg = incoming("gasté 20 mil", "573009999999");

    const result = await handleIncomingMessage(msg, d);

    expect(result).toMatchObject({ duplicate: false, status: "processed" });
    expect(sender.sent).toEqual([{ to: "573009999999", body: replies.notLinkedReply(APP_URL) }]);
    expect(extractor.calls).toBe(0);
    expect(await loggedMessage(msg.id)).toMatchObject({ status: "processed", userId: null });
  });

  it("vincula el número con un código válido y el código no se puede reutilizar", async () => {
    const user = await createUser({ name: "Ana Pérez" });
    const { code } = await createLinkCode(user.id);
    const { deps: d, sender } = deps();

    await handleIncomingMessage(incoming(`VINCULAR ${code}`), d);

    expect(sender.sent[0].body).toBe(replies.linkedReply("Ana Pérez"));
    const [link] = await db.select().from(whatsappLink).where(eq(whatsappLink.userId, user.id));
    expect(link.phone).toBe(PHONE);
    expect(await db.select().from(whatsappLinkCode)).toEqual([]);

    // Un segundo número no puede usar el mismo código.
    await handleIncomingMessage(incoming(`VINCULAR ${code}`, "573008888888"), d);
    expect(sender.sent[1].body).toBe(replies.linkInvalidReply);
  });

  it("rechaza códigos vencidos", async () => {
    const user = await createUser();
    const { code } = await createLinkCode(user.id);
    await db.update(whatsappLinkCode).set({ expiresAt: new Date(Date.now() - 1000) });
    const { deps: d, sender } = deps();

    const msg = incoming(`VINCULAR ${code}`);
    await handleIncomingMessage(msg, d);

    expect(sender.sent[0].body).toBe(replies.linkInvalidReply);
    expect((await loggedMessage(msg.id)).status).toBe("link_failed");
    expect(await db.select().from(whatsappLink)).toEqual([]);
  });

  it("bloquea el número tras 5 códigos fallidos, aunque luego envíe uno válido", async () => {
    const user = await createUser();
    const { deps: d, sender } = deps();
    for (let i = 0; i < 5; i++) await handleIncomingMessage(incoming("VINCULAR 000000"), d);
    const { code } = await createLinkCode(user.id);

    await handleIncomingMessage(incoming(`VINCULAR ${code}`), d);

    expect(sender.sent.at(-1)?.body).toBe(replies.linkRateLimitedReply);
    expect(await db.select().from(whatsappLink)).toEqual([]);
  });

  it("un número pasa a la cuenta nueva si se vincula de nuevo", async () => {
    const first = await linkedUser();
    const second = await createUser({ name: "Luis" });
    const { code } = await createLinkCode(second.id);

    await handleIncomingMessage(incoming(`VINCULAR ${code}`), deps().deps);

    const links = await db.select().from(whatsappLink);
    expect(links).toEqual([expect.objectContaining({ userId: second.id, phone: PHONE })]);
    expect(links.some((l) => l.userId === first.id)).toBe(false);
  });

  it("generar un código nuevo invalida el anterior", async () => {
    const user = await createUser();
    const { code: oldCode } = await createLinkCode(user.id);
    await createLinkCode(user.id);
    const { deps: d, sender } = deps();

    await handleIncomingMessage(incoming(`VINCULAR ${oldCode}`), d);

    expect(sender.sent[0].body).toBe(replies.linkInvalidReply);
  });
});

describe("handleIncomingMessage · límites (auditoría de seguridad 2026-10-15)", () => {
  it("si Meta rechaza la respuesta, el intento fallido de vinculación igual cuenta", async () => {
    const victim = await createUser();
    const failing = capturingSender({ fail: "131056" });
    const d = { extractor: fakeExtractor([]), send: failing.send, appUrl: APP_URL };
    for (let i = 0; i < 8; i++) await handleIncomingMessage(incoming("VINCULAR 000000"), d);

    // Solo 5 se evaluaron: el resto quedó bloqueado aunque ninguna respuesta llegó.
    expect(failing.sent.filter((m) => m.body === replies.linkInvalidReply)).toHaveLength(5);
    expect(failing.sent.filter((m) => m.body === replies.linkRateLimitedReply)).toHaveLength(3);
    const { code } = await createLinkCode(victim.id);
    const { deps: ok, sender } = deps();
    await handleIncomingMessage(incoming(`VINCULAR ${code}`), ok);
    expect(sender.sent[0].body).toBe(replies.linkRateLimitedReply);
    expect(await db.select().from(whatsappLink)).toEqual([]);
  });

  it("varios intentos de vinculación simultáneos no se saltan el límite", async () => {
    const { deps: d, sender } = deps();
    await Promise.all(Array.from({ length: 20 }, () => handleIncomingMessage(incoming("VINCULAR 000000"), d)));
    expect(sender.sent.filter((m) => m.body === replies.linkInvalidReply)).toHaveLength(5);
    expect(sender.sent.filter((m) => m.body === replies.linkRateLimitedReply)).toHaveLength(15);
  });

  it("con el cupo de mensajes agotado no llama a la IA, avisa y los comandos siguen funcionando", async () => {
    const user = await linkedUser();
    const now = new Date();
    for (let i = 0; i < 20; i++) {
      await db.insert(whatsappMessage).values({ id: `wamid.usado.${i}`, phone: PHONE, body: "x", userId: user.id, aiRequestedAt: now });
    }
    const extractor = fakeExtractor([{ type: "expense", amount: 20000, description: "Almuerzo", category: "Alimentación" }]);
    const { deps: d, sender } = deps(extractor);

    const msg = incoming("almuerzo 20 mil");
    await handleIncomingMessage(msg, d);
    expect(extractor.calls).toBe(0);
    expect(sender.sent[0].body).toBe(replies.aiRateLimitedReply);
    expect(await activeTransactions(user.id)).toEqual([]);
    expect(await loggedMessage(msg.id)).toMatchObject({ status: "processed", userId: user.id, aiRequestedAt: null });

    await handleIncomingMessage(incoming("balance"), d);
    expect(sender.sent[1].body).toContain("Aún no tienes movimientos");
  });

  it("cada mensaje que va a la IA queda reservado; los comandos no gastan cupo", async () => {
    const user = await linkedUser();
    const extractor = fakeExtractor([{ type: "expense", amount: 20000, description: "Almuerzo", category: "Alimentación" }]);
    const { deps: d } = deps(extractor);
    const free = incoming("almuerzo 20 mil");
    const command = incoming("balance");

    await handleIncomingMessage(free, d);
    await handleIncomingMessage(command, d);

    expect((await loggedMessage(free.id)).aiRequestedAt).toBeInstanceOf(Date);
    expect((await loggedMessage(command.id)).aiRequestedAt).toBeNull();
    expect(await activeTransactions(user.id)).toHaveLength(1);
  });
});

describe("handleIncomingMessage · configuración del admin (/admin/bot)", () => {
  const ALMUERZO = [{ type: "expense" as const, amount: 20000, description: "Almuerzo", category: "Alimentación" }];

  it("con Claude en pausa no lo llama ni gasta cupo: pide usar la web, y los comandos siguen", async () => {
    const user = await linkedUser();
    await db.insert(botSetting).values({ id: 1, claudePaused: true, aiPerHour: 20, aiPerDay: 100 });
    const extractor = fakeExtractor(ALMUERZO);
    const { deps: d, sender } = deps(extractor);

    const free = incoming("almuerzo 20 mil");
    await handleIncomingMessage(free, d);
    expect(extractor.calls).toBe(0);
    expect(sender.sent[0].body).toBe(replies.aiPausedReply(APP_URL));
    expect(sender.sent[0].body).toContain("https://app.test/egresos");
    expect(await activeTransactions(user.id)).toEqual([]);
    expect(await loggedMessage(free.id)).toMatchObject({
      status: "processed",
      userId: user.id,
      aiRequestedAt: null,
      intent: { kind: "error", reason: "paused" },
    });

    await handleIncomingMessage(incoming("balance"), d);
    expect(sender.sent[1].body).toContain("Aún no tienes movimientos");

    // Al reanudarlo, el siguiente mensaje ya va a Claude.
    await db.update(botSetting).set({ claudePaused: false });
    await handleIncomingMessage(incoming("almuerzo 20 mil"), d);
    expect(extractor.calls).toBe(1);
    expect(await activeTransactions(user.id)).toHaveLength(1);
  });

  it("con el tope mensual de tokens alcanzado no llama a Claude: pide usar la web, y los comandos siguen", async () => {
    const user = await linkedUser();
    await db.insert(botSetting).values({ id: 1, aiPerHour: 20, aiPerDay: 100, monthlyTokenLimit: 10_000 });
    // Lo que ya se usó este mes, de otra cuenta.
    await db.insert(whatsappMessage).values({
      id: "wamid.usado.mes",
      phone: "573009998877",
      body: "x",
      intent: { kind: "reply", usage: { model: "claude-haiku-5-5", inputTokens: 9_900, outputTokens: 100 } },
      aiRequestedAt: new Date(),
    });
    const extractor = fakeExtractor(ALMUERZO);
    const { deps: d, sender } = deps(extractor);

    const free = incoming("almuerzo 20 mil");
    await handleIncomingMessage(free, d);
    expect(extractor.calls).toBe(0);
    expect(sender.sent[0].body).toBe(replies.aiMonthlyLimitReply(APP_URL));
    expect(await loggedMessage(free.id)).toMatchObject({
      status: "processed",
      aiRequestedAt: null,
      intent: { kind: "error", reason: "monthly_limit" },
    });
    expect(await activeTransactions(user.id)).toEqual([]);
    await handleIncomingMessage(incoming("balance"), d);
    expect(sender.sent[1].body).toContain("Aún no tienes movimientos");
  });

  it("por debajo del tope mensual, o sin tope, llama a Claude como siempre", async () => {
    await linkedUser();
    await db.insert(botSetting).values({ id: 1, aiPerHour: 20, aiPerDay: 100, monthlyTokenLimit: 10_000 });
    const extractor = fakeExtractor(ALMUERZO);
    const { deps: d } = deps(extractor);
    await handleIncomingMessage(incoming("almuerzo 20 mil"), d);
    expect(extractor.calls).toBe(1);

    await db.update(botSetting).set({ monthlyTokenLimit: null });
    await handleIncomingMessage(incoming("almuerzo 20 mil"), d);
    expect(extractor.calls).toBe(2);
  });

  it("usa los topes que dejó el admin", async () => {
    await linkedUser();
    await db.insert(botSetting).values({ id: 1, claudePaused: false, aiPerHour: 1, aiPerDay: 5 });
    const extractor = fakeExtractor(ALMUERZO);
    const { deps: d, sender } = deps(extractor);

    await handleIncomingMessage(incoming("almuerzo 20 mil"), d);
    await handleIncomingMessage(incoming("almuerzo 20 mil"), d);
    expect(extractor.calls).toBe(1);
    expect(sender.sent[1].body).toBe(replies.aiRateLimitedReply);
  });
});

describe("handleIncomingMessage · registro de movimientos", () => {
  it("registra los movimientos con categoría, origen WhatsApp y responde con el balance", async () => {
    const user = await linkedUser();
    const extractor = fakeExtractor([
      { type: "expense", amount: 500000, description: "Zapatos", category: "ropa" },
      { type: "income", amount: 2000000, description: "Quincena", category: "Salario" },
    ]);
    const { deps: d, sender } = deps(extractor);
    const msg = incoming("zapatos 500 mil y me pagaron la quincena 2 millones");

    await handleIncomingMessage(msg, d);

    const txs = await activeTransactions(user.id);
    const ropa = await db.select().from(category).where(eq(category.name, "Ropa"));
    expect(txs).toHaveLength(2);
    expect(txs.find((t) => t.description === "Zapatos")).toMatchObject({
      type: "expense",
      amount: 500000,
      source: "whatsapp",
      externalId: `${msg.id}:0`,
      categoryId: ropa[0].id,
    });
    expect(sender.sent[0].body).toContain("Egreso Anotado: *Zapatos*");
    expect(sender.sent[0].body.replace(/ /g, " ")).toContain("*$1.500.000,00*");
    expect(await loggedMessage(msg.id)).toMatchObject({ status: "processed", userId: user.id });
  });

  it("guarda los centavos que entendió el bot, los muestra y deshacer los lista", async () => {
    const user = await linkedUser();
    // La IA puede proponer más de dos decimales: se redondea a centavos.
    const extractor = fakeExtractor([
      { type: "expense", amount: 25900.5, description: "Almuerzo", category: "Alimentación" },
      { type: "expense", amount: 3500.755, description: "Parqueadero", category: "Transporte" },
    ]);
    const { deps: d, sender } = deps(extractor);

    await handleIncomingMessage(incoming("almuerzo 25.900,50 y parqueadero 3.500,76"), d);

    expect((await activeTransactions(user.id)).map((t) => t.amount).sort((a, b) => a - b)).toEqual([3500.76, 25900.5]);
    expect(sender.sent[0].body).toContain("*Almuerzo* — $25.900,50");
    expect(sender.sent[0].body).toContain("*Parqueadero* — $3.500,76");
    expect(sender.sent[0].body).toContain("*−$29.401,26*");

    await handleIncomingMessage(incoming("deshacer"), d);
    expect(sender.sent[1].body).toContain("Almuerzo — $25.900,50");
    expect(sender.sent[1].body).toContain("Parqueadero — $3.500,76");
  });

  it("registra en la cuenta dueña del número que escribe, nunca en otra", async () => {
    const ana = await linkedUser();
    const beto = await linkedUser("573007777777", "Beto");
    const zapatos = fakeExtractor([
      { type: "expense", amount: 500000, description: "Zapatos", category: "Ropa" },
    ]);

    await handleIncomingMessage(incoming("zapatos", "573007777777"), deps(zapatos).deps);

    expect(await activeTransactions(ana.id)).toEqual([]);
    expect(await activeTransactions(beto.id)).toEqual([
      expect.objectContaining({ description: "Zapatos", userId: beto.id }),
    ]);
  });

  it("un número sin vincular no registra nada ni puede ver el balance de nadie", async () => {
    const ana = await linkedUser();
    const add = fakeExtractor([
      { type: "expense", amount: 500000, description: "Zapatos", category: "Ropa" },
    ]);
    await handleIncomingMessage(incoming("zapatos"), deps(add).deps);

    const extractor = fakeExtractor([
      { type: "expense", amount: 1, description: "Intruso", category: "Otros" },
    ]);
    const { deps: d, sender } = deps(extractor);
    await handleIncomingMessage(incoming("balance", "573005550000"), d);
    await handleIncomingMessage(incoming("gasté 1 peso", "573005550000"), d);
    await handleIncomingMessage(incoming("deshacer", "573005550000"), d);

    expect(extractor.calls).toBe(0);
    for (const message of sender.sent) {
      expect(message.to).toBe("573005550000");
      expect(message.body).not.toContain("500.000");
    }
    expect(await activeTransactions(ana.id)).toHaveLength(1);
  });

  it("ignora el mismo mensaje si Meta lo entrega dos veces", async () => {
    const user = await linkedUser();
    const extractor = fakeExtractor([
      { type: "expense", amount: 20000, description: "Almuerzo", category: "Alimentación" },
    ]);
    const { deps: d, sender } = deps(extractor);
    const msg = incoming("almuerzo 20 mil");

    await handleIncomingMessage(msg, d);
    const second = await handleIncomingMessage(msg, d);

    expect(second).toEqual({ duplicate: true });
    expect(await activeTransactions(user.id)).toHaveLength(1);
    expect(extractor.calls).toBe(1);
    expect(sender.sent).toHaveLength(1);
  });

  it("pasa a la IA las categorías y la fecha del usuario", async () => {
    await linkedUser();
    let received: ExtractionInput | null = null;
    const extractor = fakeExtractor((input) => {
      received = input;
      return {
        ok: true,
        transactions: [],
        reply: "¿Cuánto?",
        usage: { model: "f", inputTokens: 0, outputTokens: 0 },
      };
    });

    await handleIncomingMessage(incoming("me compré algo"), deps(extractor).deps);

    expect(received!.categories.expense).toContain("Ropa");
    expect(received!.categories.income).toContain("Salario");
    expect(received!.today.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("responde la pregunta de la IA sin registrar nada", async () => {
    const user = await linkedUser();
    const { deps: d, sender } = deps(fakeExtractor([]));

    await handleIncomingMessage(incoming("me compré unos tenis"), d);

    expect(sender.sent[0].body).toBe("¿Cuánto fue?");
    expect(await activeTransactions(user.id)).toEqual([]);
  });
});

describe("handleIncomingMessage · balance de otro mes", () => {
  // Las fechas salen de hoy en Bogotá (la zona de las cuentas de prueba).
  const current = monthOf(todayInTimezone("America/Bogota"));
  const previous = shiftMonth(current, -1);
  const twoBefore = shiftMonth(current, -2);
  const day = (month: { year: number; month: number }) => `${monthParam(month)}-10`;
  const add = (userId: string, type: "income" | "expense", amount: number, month: { year: number; month: number }) =>
    db.insert(transaction).values({ userId, type, amount, description: "Movimiento", occurredOn: day(month) });
  const replyTo = async (text: string) => {
    const { deps: d, sender } = deps();
    await handleIncomingMessage(incoming(text), d);
    return sender.sent[0].body.replace(/\u00a0/g, " ");
  };

  it("\"balance <mes>\" resume ese mes, solo del usuario, y lo compara con el anterior", async () => {
    const user = await linkedUser();
    const other = await linkedUser("573007777777", "Otro");
    await add(user.id, "income", 2000000, previous);
    await add(user.id, "expense", 500000, previous);
    await add(user.id, "expense", 300000, twoBefore);
    await add(user.id, "expense", 999999, current);
    await add(other.id, "income", 7777777, previous);

    const reply = await replyTo(`balance ${formatMonthName(previous)} ${previous.year}`);
    expect(reply.split("\n")).toEqual([
      `📊 *${formatMonthLabel(previous)}*`,
      "Ingresos: $2.000.000,00",
      "Egresos: $500.000,00",
      "Balance: *$1.500.000,00*",
      `_↗ $1.800.000,00 más que ${formatMonthName(twoBefore)}_`,
    ]);
  });

  it("\"balance mes pasado\" es el anterior; sin movimientos antes, no compara", async () => {
    const user = await linkedUser();
    await add(user.id, "expense", 45900.5, previous);

    const reply = await replyTo("balance mes pasado");
    expect(reply).toContain(`📊 *${formatMonthLabel(previous)}*`);
    expect(reply).toContain("Egresos: $45.900,50");
    expect(reply).not.toContain("_");
  });

  it("el balance de siempre (este mes) también compara con el anterior", async () => {
    const user = await linkedUser();
    await add(user.id, "income", 100000, current);
    await add(user.id, "income", 250000, previous);

    const reply = await replyTo("balance");
    expect(reply).toContain(`📊 *${formatMonthLabel(current)}*`);
    expect(reply.split("\n").at(-1)).toBe(`_↘ $150.000,00 menos que ${formatMonthName(previous)}_`);
  });

  it("una pregunta como llegó por WhatsApp (\"¿Cuántos fueron mis ingresos en septiembre?\") responde el balance de ese mes", async () => {
    const user = await linkedUser();
    await add(user.id, "income", 2000000, previous);
    const name = formatMonthName(previous);
    const reply = await replyTo(`¿Cuántos fueron mis ingresos en ${name.charAt(0).toUpperCase()}${name.slice(1)} ${previous.year}?`);
    expect(reply).toContain(`📊 *${formatMonthLabel(previous)}*`);
    expect(reply).toContain("Ingresos: $2.000.000,00");
  });

  it("un mes que todavía no llega lo dice, sin consultar nada", async () => {
    await linkedUser();
    const next = shiftMonth(current, 2);
    expect(await replyTo(`balance ${formatMonthName(next)} ${next.year}`)).toBe(replies.futureMonthReply(next));
  });

  it("un mes de antes del 2000 (o un año como 0000) responde sin consultar la base ni fallar", async () => {
    await linkedUser();
    expect(await replyTo("balance enero 0000")).toBe(replies.tooOldMonthReply);
    expect(await replyTo("balance diciembre 1999")).toBe(replies.tooOldMonthReply);
  });

  it("un número sin vincular no ve el balance de otro mes de nadie", async () => {
    const user = await linkedUser();
    await add(user.id, "income", 2000000, previous);
    const { deps: d, sender } = deps();
    await handleIncomingMessage(incoming("balance mes pasado", "573005550000"), d);
    expect(sender.sent[0].body).not.toContain("2.000.000");
  });
});

describe("handleIncomingMessage · reporte", () => {
  const current = monthOf(todayInTimezone("America/Bogota"));
  const previous = shiftMonth(current, -1);
  const add = (userId: string, type: "income" | "expense", amount: number, month: { year: number; month: number }) =>
    db.insert(transaction).values({ userId, type, amount, description: "Movimiento", occurredOn: `${monthParam(month)}-10` });
  const send = async (text: string, phone = PHONE) => {
    const { deps: d, sender, extractor } = deps();
    const msg = incoming(text, phone);
    await handleIncomingMessage(msg, d);
    return { reply: sender.sent[0].body.replace(/\u00a0/g, " "), extractor, msg };
  };

  it("\"reporte\" resume los últimos 12 meses, solo del usuario, sin llamar a Claude, con el enlace a Reportes", async () => {
    const user = await linkedUser();
    const other = await linkedUser("573007777777", "Otro");
    await add(user.id, "income", 2000000, previous);
    await add(user.id, "expense", 500000, previous);
    await add(user.id, "expense", 300000, current);
    await add(other.id, "income", 7777777, previous);

    const { reply, extractor, msg } = await send("reporte");
    const from = formatMonthName(shiftMonth(current, -11), { withYear: true });
    expect(reply.split("\n")).toEqual([
      `📊 *Reporte de ${from} a ${formatMonthName(current, { withYear: true })}*`,
      "Ingresos: $2.000.000,00",
      "Egresos: $800.000,00",
      "Balance: *$1.200.000,00* (ahorraste el 60%)",
      "Gasto promedio por mes: $500.000,00",
      `Mes de más gasto: ${formatMonthName(previous, { withYear: true })} ($500.000,00)`,
      "En qué se te fue: • Sin categoría 100%",
      "",
      `Más detalle en *Reportes*: ${APP_URL}/reportes`,
    ]);
    expect(reply).not.toContain("7.777.777");
    expect(extractor.calls).toBe(0);
    expect(await loggedMessage(msg.id)).toMatchObject({ status: "processed", intent: { kind: "command", command: "report" } });
  });

  it("\"reporte <año>\" es ese año, con su enlace", async () => {
    const user = await linkedUser();
    const lastYear = { year: current.year - 1, month: 6 };
    await add(user.id, "expense", 120000, lastYear);
    const { reply } = await send(`informe del ${lastYear.year}`);
    expect(reply).toMatch(new RegExp(`^📊 \\*Reporte de enero a diciembre de ${lastYear.year}\\*`));
    expect(reply).toContain("Egresos: $120.000,00");
    expect(reply).toContain(`Más detalle en *Reportes*: ${APP_URL}/reportes?periodo=${lastYear.year}`);
  });

  it("un año que todavía no llega, o de antes del 2000, responde sin consultar nada; sin movimientos, lo dice", async () => {
    await linkedUser();
    expect((await send(`reporte ${current.year + 1}`)).reply).toBe(replies.futureYearReply(current.year + 1));
    expect((await send("reporte 1999")).reply).toBe(replies.tooOldYearReply);
    expect((await send("reporte")).reply).toMatch(/^No tienes movimientos de /);
  });

  it("un número sin vincular no ve el reporte de nadie", async () => {
    const user = await linkedUser();
    await add(user.id, "income", 2000000, previous);
    const { reply } = await send("reporte", "573005550000");
    expect(reply).toBe(replies.notLinkedReply(APP_URL));
  });
});

describe("handleIncomingMessage · comandos", () => {
  it("balance resume solo el mes actual del usuario, sin movimientos borrados ni ajenos", async () => {
    const user = await linkedUser();
    const other = await linkedUser("573007777777", "Otro");
    const add = fakeExtractor([
      { type: "income", amount: 1000000, description: "Pago", category: "Salario" },
      { type: "expense", amount: 300000, description: "Mercado", category: "Mercado" },
    ]);
    await handleIncomingMessage(incoming("pago y mercado"), deps(add).deps);
    await handleIncomingMessage(incoming("pago y mercado", "573007777777"), deps(add).deps);
    const extra = fakeExtractor([
      { type: "expense", amount: 999999, description: "Error", category: "Otros" },
    ]);
    await handleIncomingMessage(incoming("error"), deps(extra).deps);
    await handleIncomingMessage(incoming("deshacer"), deps().deps);

    const { deps: d, sender } = deps();
    await handleIncomingMessage(incoming("balance"), d);

    const body = sender.sent[0].body.replace(/ /g, " ");
    expect(body).toContain("Ingresos: $1.000.000,00");
    expect(body).toContain("Egresos: $300.000,00");
    expect(body).toContain("Balance: *$700.000,00*");
    // Los movimientos del otro usuario siguen intactos.
    expect(await activeTransactions(other.id)).toHaveLength(2);
    expect(await activeTransactions(user.id)).toHaveLength(2);
  });

  it("deshacer borra solo el último mensaje registrado, y luego el anterior", async () => {
    const user = await linkedUser();
    const first = fakeExtractor([
      { type: "expense", amount: 10000, description: "Café", category: "Alimentación" },
    ]);
    const second = fakeExtractor([
      { type: "expense", amount: 20000, description: "Almuerzo", category: "Alimentación" },
      { type: "expense", amount: 12000, description: "Taxi", category: "Transporte" },
    ]);
    await handleIncomingMessage(incoming("café"), deps(first).deps);
    await handleIncomingMessage(incoming("almuerzo y taxi"), deps(second).deps);

    const { deps: d, sender } = deps();
    await handleIncomingMessage(incoming("deshacer"), d);
    expect((await activeTransactions(user.id)).map((t) => t.description)).toEqual(["Café"]);
    expect(sender.sent[0].body).toContain("Almuerzo");
    expect(sender.sent[0].body).toContain("Taxi");

    await handleIncomingMessage(incoming("deshacer"), d);
    expect(await activeTransactions(user.id)).toEqual([]);

    await handleIncomingMessage(incoming("deshacer"), d);
    expect(sender.sent[2].body).toBe(replies.undoReply([], "COP"));
  });

  it("deshacer no toca los movimientos de otro usuario, aunque sean más recientes", async () => {
    const ana = await linkedUser();
    const beto = await linkedUser("573007777777", "Beto");
    const cafe = fakeExtractor([
      { type: "expense", amount: 10000, description: "Café", category: "Alimentación" },
    ]);
    await handleIncomingMessage(incoming("café"), deps(cafe).deps);
    await handleIncomingMessage(incoming("café", "573007777777"), deps(cafe).deps);

    await handleIncomingMessage(incoming("deshacer"), deps().deps);

    expect(await activeTransactions(ana.id)).toEqual([]);
    expect(await activeTransactions(beto.id)).toHaveLength(1);
  });

  it("deshacer no toca movimientos registrados desde la web", async () => {
    const user = await linkedUser();
    await db.insert(transaction).values({
      userId: user.id,
      type: "expense",
      amount: 50000,
      description: "Desde la web",
      occurredOn: "2026-10-01",
      source: "web",
    });

    await handleIncomingMessage(incoming("deshacer"), deps().deps);

    expect(await activeTransactions(user.id)).toHaveLength(1);
  });

  it("ayuda saluda por el nombre", async () => {
    await linkedUser(PHONE, "Ana Pérez");
    const { deps: d, sender } = deps();
    await handleIncomingMessage(incoming("ayuda"), d);
    expect(sender.sent[0].body).toBe(replies.helpReply("Ana Pérez"));
  });
});

describe("handleIncomingMessage · categorías", () => {
  it("no le pasa a la IA las categorías archivadas; si propone una, el movimiento queda en Otros", async () => {
    const ana = await linkedUser();
    await db.update(category).set({ archivedAt: new Date() }).where(eq(category.name, "Ropa"));
    let seen: readonly string[] = [];
    const extractor = fakeExtractor((input: ExtractionInput) => {
      seen = input.categories.expense;
      return {
        ok: true,
        reply: null,
        usage: { model: "fake", inputTokens: 0, outputTokens: 0 },
        transactions: [{ type: "expense", amount: 80000, description: "Camisa", category: "Ropa", date: input.today.iso }],
      };
    });
    await handleIncomingMessage(incoming("camisa 80 mil"), deps(extractor).deps);

    expect(seen).not.toContain("Ropa");
    expect(seen.at(-1)).toBe("Otros");
    const [tx] = await activeTransactions(ana.id);
    const [otros] = await db.select().from(category).where(and(eq(category.name, "Otros"), eq(category.type, "expense")));
    expect(tx.categoryId).toBe(otros.id);
  });
});

describe("handleIncomingMessage · cuenta suspendida", () => {
  it("no registra nada, no llama a la IA ni deja ver el balance, el reporte o deshacer: responde que está suspendida", async () => {
    const ana = await linkedUser();
    const add = fakeExtractor([{ type: "expense", amount: 30000, description: "Almuerzo", category: "Comida" }]);
    await handleIncomingMessage(incoming("almuerzo 30 mil"), deps(add).deps);
    await db.update(userTable).set({ suspendedAt: new Date() }).where(eq(userTable.id, ana.id));

    const extractor = fakeExtractor([{ type: "expense", amount: 1, description: "Otro", category: "Comida" }]);
    const { deps: d, sender } = deps(extractor);
    const messages = [incoming("gasté 20 mil"), incoming("balance"), incoming("reporte"), incoming("deshacer"), incoming("ayuda")];
    for (const msg of messages) await handleIncomingMessage(msg, d);

    expect(extractor.calls).toBe(0);
    expect(sender.sent).toEqual(messages.map(() => ({ to: PHONE, body: replies.suspendedReply })));
    // Lo que había registrado sigue ahí (deshacer no lo borró).
    expect(await activeTransactions(ana.id)).toHaveLength(1);
    // El mensaje queda a nombre de la cuenta, sin intención.
    expect(await loggedMessage(messages[0].id)).toMatchObject({ status: "processed", userId: ana.id, intent: null, reply: replies.suspendedReply });
  });

  it("solo esa cuenta: otro número vinculado sigue funcionando", async () => {
    const ana = await linkedUser();
    const beto = await linkedUser("573004445566", "Beto");
    await db.update(userTable).set({ suspendedAt: new Date() }).where(eq(userTable.id, ana.id));
    const add = fakeExtractor([{ type: "expense", amount: 30000, description: "Almuerzo", category: "Comida" }]);
    await handleIncomingMessage(incoming("almuerzo 30 mil", "573004445566"), deps(add).deps);
    expect(add.calls).toBe(1);
    expect(await activeTransactions(beto.id)).toHaveLength(1);
  });

  it("reactivada, el bot vuelve a registrar", async () => {
    const ana = await linkedUser();
    await db.update(userTable).set({ suspendedAt: new Date() }).where(eq(userTable.id, ana.id));
    await db.update(userTable).set({ suspendedAt: null }).where(eq(userTable.id, ana.id));
    const add = fakeExtractor([{ type: "expense", amount: 30000, description: "Almuerzo", category: "Comida" }]);
    await handleIncomingMessage(incoming("almuerzo 30 mil"), deps(add).deps);
    expect(await activeTransactions(ana.id)).toHaveLength(1);
  });
});

describe("handleIncomingMessage · errores", () => {
  it("sin API key avisa qué comandos funcionan", async () => {
    await linkedUser();
    const extractor = fakeExtractor(() => ({ ok: false, reason: "not_configured" }));
    const { deps: d, sender } = deps(extractor);
    const msg = incoming("gasté 20 mil");

    await handleIncomingMessage(msg, d);

    expect(sender.sent[0].body).toBe(replies.aiUnavailableReply);
    expect(await loggedMessage(msg.id)).toMatchObject({
      status: "failed",
      error: "not_configured",
    });
  });

  it("si la API de Claude falla responde un error genérico y lo registra", async () => {
    await linkedUser();
    const extractor = fakeExtractor(() => ({
      ok: false,
      reason: "api_error",
      detail: "529 overloaded",
    }));
    const { deps: d, sender } = deps(extractor);
    const msg = incoming("gasté 20 mil");

    await handleIncomingMessage(msg, d);

    expect(sender.sent[0].body).toBe(replies.errorReply);
    expect((await loggedMessage(msg.id)).error).toContain("529 overloaded");
  });

  it("si algo lanza una excepción no se cae, responde el error genérico y no copia el mensaje del error", async () => {
    await linkedUser();
    // Como un error de la base: su mensaje trae los datos de la consulta.
    const extractor = fakeExtractor(() => {
      throw Object.assign(new Error("Failed query\nparams: 573001112233,gasté 80 mil en farmacia"), {
        name: "DrizzleQueryError",
        cause: { code: "57P01" },
      });
    });
    const { deps: d, sender } = deps(extractor);
    const msg = incoming("gasté 20 mil");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await handleIncomingMessage(msg, d);

    expect(result).toMatchObject({ status: "failed" });
    expect(sender.sent[0].body).toBe(replies.errorReply);
    expect((await loggedMessage(msg.id)).error).toBe("DrizzleQueryError (57P01)");
    expect(consoleError).toHaveBeenCalledWith("[bot] error procesando mensaje", msg.id, "DrizzleQueryError (57P01)");
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/farmacia|params/);
    consoleError.mockRestore();
  });

  it("registra cuando Meta rechaza el envío de la respuesta", async () => {
    await linkedUser();
    const sender = capturingSender({ fail: "131030 recipient not in allowed list" });
    const msg = incoming("balance");

    await handleIncomingMessage(msg, deps(fakeExtractor([]), sender).deps);

    const logged = await loggedMessage(msg.id);
    expect(logged.status).toBe("failed");
    expect(logged.error).toContain("131030");
  });

  it("a audios e imágenes responde que solo entiende texto", async () => {
    const { deps: d, sender } = deps();
    const msg = incoming(null);

    await handleIncomingMessage(msg, d);

    expect(sender.sent[0].body).toBe(replies.unsupportedTypeReply);
    const [row] = await db.select().from(whatsappMessage).where(eq(whatsappMessage.id, msg.id));
    expect(row.body).toBe("[audio]");
  });
});

describe("handleIncomingMessage · la descripción del historial", () => {
  const today = () => todayInTimezone("America/Bogota");
  /** El mismo día, `months` meses atrás. */
  const monthsAgo = (months: number) => sameDayIn(shiftMonth(monthOf(today()), -months), today());
  const globalCategory = async (type: "expense" | "income", name: string) =>
    (await db.select().from(category).where(and(eq(category.type, type), eq(category.name, name), isNull(category.userId))))[0];
  const addHistory = (values: Partial<typeof transaction.$inferInsert> & { userId: string; description: string }) =>
    db.insert(transaction).values({ type: "expense", amount: 98000, occurredOn: monthsAgo(1), ...values });
  const claroAmor = fakeExtractor([{ type: "expense", amount: 98000, description: "Pago claro amor", category: "Otros" }]);

  it("'pago claro amor' se guarda como 'Claro Postpago Cata Amor', con su categoría, y la respuesta lo dice", async () => {
    const user = await linkedUser();
    const servicios = await globalCategory("expense", "Servicios");
    await addHistory({ userId: user.id, description: "Claro Postpago Cata Amor", categoryId: servicios.id });
    const { deps: d, sender } = deps(claroAmor);

    await handleIncomingMessage(incoming("pago claro amor 98 mil"), d);

    const saved = (await activeTransactions(user.id)).find((t) => t.source === "whatsapp")!;
    expect(saved).toMatchObject({ description: "Claro Postpago Cata Amor", categoryId: servicios.id, amount: 98000 });
    expect(sender.sent[0].body).toContain("Egreso Anotado: *Claro Postpago Cata Amor*");
    expect(sender.sent[0].body).toContain("(Servicios)");
  });

  it("solo su propio historial, del mismo tipo, sin lo eliminado y de los últimos 12 meses", async () => {
    const user = await linkedUser();
    const other = await createUser({ name: "Beto" });
    await addHistory({ userId: other.id, description: "Claro Postpago Cata Amor" });
    await addHistory({ userId: user.id, description: "Claro Postpago Cata Amor", type: "income" });
    await addHistory({ userId: user.id, description: "Claro Postpago Cata Amor Viejo", occurredOn: monthsAgo(13) });
    await addHistory({ userId: user.id, description: "Claro Postpago Borrado Amor", deletedAt: new Date() });
    const { deps: d } = deps(claroAmor);

    await handleIncomingMessage(incoming("pago claro amor 98 mil"), d);
    expect((await activeTransactions(user.id)).find((t) => t.source === "whatsapp")).toMatchObject({ description: "Pago claro amor" });
  });

  it("hace 11 meses todavía cuenta", async () => {
    const user = await linkedUser();
    await addHistory({ userId: user.id, description: "Claro Postpago Cata Amor", occurredOn: monthsAgo(11) });
    const { deps: d } = deps(claroAmor);
    await handleIncomingMessage(incoming("pago claro amor 98 mil"), d);
    expect((await activeTransactions(user.id)).find((t) => t.source === "whatsapp")).toMatchObject({ description: "Claro Postpago Cata Amor" });
  });

  it("con una sola palabra, solo la misma: 'Almuerzo' no se vuelve 'Almuerzo con Ana'", async () => {
    const user = await linkedUser();
    await addHistory({ userId: user.id, description: "Almuerzo con Ana" });
    const { deps: d } = deps(fakeExtractor([{ type: "expense", amount: 25000, description: "Almuerzo", category: "Alimentación" }]));
    await handleIncomingMessage(incoming("almuerzo 25 mil"), d);
    expect((await activeTransactions(user.id)).find((t) => t.source === "whatsapp")).toMatchObject({ description: "Almuerzo" });
  });

  it("si la categoría de la última vez ya no se puede elegir (archivada), queda la de Claude", async () => {
    const user = await linkedUser();
    const salud = await globalCategory("expense", "Salud");
    const servicios = await globalCategory("expense", "Servicios");
    await addHistory({ userId: user.id, description: "Claro Postpago Cata Amor", categoryId: salud.id });
    await db.update(category).set({ archivedAt: new Date() }).where(eq(category.id, salud.id));
    const { deps: d } = deps(fakeExtractor([{ type: "expense", amount: 98000, description: "Pago claro amor", category: "Servicios" }]));
    await handleIncomingMessage(incoming("pago claro amor 98 mil"), d);
    expect((await activeTransactions(user.id)).find((t) => t.source === "whatsapp")).toMatchObject({
      description: "Claro Postpago Cata Amor",
      categoryId: servicios.id,
    });
  });

  it("en un mensaje con varios, cada uno por su lado", async () => {
    const user = await linkedUser();
    await addHistory({ userId: user.id, description: "Claro Postpago Cata Amor" });
    const { deps: d, sender } = deps(
      fakeExtractor([
        { type: "expense", amount: 98000, description: "Pago claro amor", category: "Servicios" },
        { type: "expense", amount: 12000, description: "Taxi aeropuerto", category: "Transporte" },
      ]),
    );
    await handleIncomingMessage(incoming("claro amor 98 mil y taxi 12 mil"), d);
    const fromBot = (await activeTransactions(user.id)).filter((t) => t.source === "whatsapp").map((t) => t.description);
    expect(fromBot.sort()).toEqual(["Claro Postpago Cata Amor", "Taxi aeropuerto"]);
    expect(sender.sent[0].body).toContain("*Claro Postpago Cata Amor*");
    expect(sender.sent[0].body).toContain("*Taxi aeropuerto*");
  });
});
