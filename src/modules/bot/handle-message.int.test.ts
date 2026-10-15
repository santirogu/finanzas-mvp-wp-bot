import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  category,
  transaction,
  user as userTable,
  whatsappLink,
  whatsappLinkCode,
  whatsappMessage,
} from "@/db/schema";
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
    expect(sender.sent[0].body).toContain("Egreso registrado: *Zapatos*");
    expect(sender.sent[0].body.replace(/ /g, " ")).toContain("*$ 1.500.000*");
    expect(await loggedMessage(msg.id)).toMatchObject({ status: "processed", userId: user.id });
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
    expect(body).toContain("Ingresos: $ 1.000.000");
    expect(body).toContain("Egresos: $ 300.000");
    expect(body).toContain("Balance: *$ 700.000*");
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
  it("no registra nada, no llama a la IA ni deja ver el balance o deshacer: responde que está suspendida", async () => {
    const ana = await linkedUser();
    const add = fakeExtractor([{ type: "expense", amount: 30000, description: "Almuerzo", category: "Comida" }]);
    await handleIncomingMessage(incoming("almuerzo 30 mil"), deps(add).deps);
    await db.update(userTable).set({ suspendedAt: new Date() }).where(eq(userTable.id, ana.id));

    const extractor = fakeExtractor([{ type: "expense", amount: 1, description: "Otro", category: "Comida" }]);
    const { deps: d, sender } = deps(extractor);
    const messages = [incoming("gasté 20 mil"), incoming("balance"), incoming("deshacer"), incoming("ayuda")];
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

  it("si el extractor lanza una excepción no se cae y responde el error genérico", async () => {
    await linkedUser();
    const extractor = fakeExtractor(() => {
      throw new Error("boom");
    });
    const { deps: d, sender } = deps(extractor);
    const msg = incoming("gasté 20 mil");

    const result = await handleIncomingMessage(msg, d);

    expect(result).toMatchObject({ status: "failed" });
    expect(sender.sent[0].body).toBe(replies.errorReply);
    expect((await loggedMessage(msg.id)).error).toBe("boom");
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
