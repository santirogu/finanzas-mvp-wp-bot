import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/limpieza/route";
import { db } from "@/db";
import { accountEvent, cronRun, transaction, whatsappMessage } from "@/db/schema";
import { createUser } from "../../../test/integration/factories";
import { purgeDeletedTransactions, RETENTION_DAYS, runDailyCleanup } from "./retention";

const NOW = new Date("2026-10-15T09:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
let seq = 0;

async function tx(userId: string, deletedAt: Date | null) {
  const [row] = await db
    .insert(transaction)
    .values({ userId, type: "expense", amount: 1000, description: `Gasto ${seq++}`, occurredOn: "2026-09-01", deletedAt })
    .returning({ id: transaction.id });
  return row.id;
}

const cron = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/limpieza", { headers: authorization ? { authorization } : {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("purgeDeletedTransactions", () => {
  it("borra del todo solo los eliminados antes del corte; los vigentes y los recién eliminados quedan", async () => {
    const ana = await createUser();
    const old = await tx(ana.id, daysAgo(31));
    const recent = await tx(ana.id, daysAgo(5));
    const active = await tx(ana.id, null);

    expect(await purgeDeletedTransactions(daysAgo(30))).toBe(1);

    const left = (await db.select({ id: transaction.id }).from(transaction)).map((row) => row.id).sort();
    expect(left).toEqual([recent, active].sort());
    expect(left).not.toContain(old);
  });
});

describe("runDailyCleanup", () => {
  it("borra lo vencido según RETENTION_DAYS y devuelve solo cantidades", async () => {
    expect(RETENTION_DAYS).toEqual({ orphans: 30, deletedTransactions: 30 });
    const ana = await createUser();
    await tx(ana.id, daysAgo(40));
    await tx(ana.id, daysAgo(1));
    // Un mensaje y un intento de vinculación de un número sin cuenta: uno vencido y uno reciente.
    await db.insert(whatsappMessage).values([
      { id: "wamid.viejo", phone: "573009990000", body: "hola", receivedAt: daysAgo(31) },
      { id: "wamid.nuevo", phone: "573009990000", body: "hola", receivedAt: daysAgo(2) },
    ]);
    await db.insert(accountEvent).values({
      type: "whatsapp_link_failed",
      phone: "573009990000",
      details: { reason: "invalid_code" },
      createdAt: daysAgo(31),
    });

    expect(await runDailyCleanup(NOW)).toEqual({ messages: 1, events: 1, transactions: 1 });
    expect((await db.select({ id: whatsappMessage.id }).from(whatsappMessage)).map((row) => row.id)).toEqual(["wamid.nuevo"]);
    expect(await runDailyCleanup(NOW)).toEqual({ messages: 0, events: 0, transactions: 0 });
  });
});

describe("runDailyCleanup: el plazo exacto que promete /privacidad", () => {
  const HOUR = 60 * 60 * 1000;
  // Un poco antes y un poco después de cumplir el plazo: así un corte corrido en un día (o en nueve)
  // hace fallar la prueba.
  const justBefore = (days: number) => new Date(daysAgo(days).getTime() + HOUR);
  const justAfter = (days: number) => new Date(daysAgo(days).getTime() - HOUR);

  it("los movimientos eliminados se borran al cumplir 30 días, no antes", async () => {
    const ana = await createUser();
    const keep = await tx(ana.id, justBefore(RETENTION_DAYS.deletedTransactions));
    await tx(ana.id, justAfter(RETENTION_DAYS.deletedTransactions));

    expect(await runDailyCleanup(NOW)).toMatchObject({ transactions: 1 });
    expect((await db.select({ id: transaction.id }).from(transaction)).map((row) => row.id)).toEqual([keep]);
  });

  it("los mensajes y los intentos de un número sin cuenta se borran al cumplir 30 días, no antes", async () => {
    await db.insert(whatsappMessage).values([
      { id: "wamid.casi", phone: "573009990000", body: "hola", receivedAt: justBefore(RETENTION_DAYS.orphans) },
      { id: "wamid.vencido", phone: "573009990000", body: "hola", receivedAt: justAfter(RETENTION_DAYS.orphans) },
    ]);
    await db.insert(accountEvent).values([
      { type: "whatsapp_link_failed", phone: "573009990000", details: { reason: "invalid_code" }, createdAt: justBefore(RETENTION_DAYS.orphans) },
      { type: "whatsapp_link_failed", phone: "573009990000", details: { reason: "invalid_code" }, createdAt: justAfter(RETENTION_DAYS.orphans) },
    ]);

    expect(await runDailyCleanup(NOW)).toEqual({ messages: 1, events: 1, transactions: 0 });
    expect((await db.select({ id: whatsappMessage.id }).from(whatsappMessage)).map((row) => row.id)).toEqual(["wamid.casi"]);
    expect(await db.select({ createdAt: accountEvent.createdAt }).from(accountEvent)).toEqual([
      { createdAt: justBefore(RETENTION_DAYS.orphans) },
    ]);
  });
});

describe("las acciones del admin sin cuenta ni número", () => {
  it("se conservan: no son datos de un número sin cuenta", async () => {
    const admin = await createUser({ role: "admin" });
    const old = daysAgo(RETENTION_DAYS.orphans + 60);
    // "Un admin eliminó una cuenta": sin datos de la cuenta, ni siquiera su número.
    await db.insert(accountEvent).values({ type: "account_deleted", userId: null, adminId: admin.id, phone: null, createdAt: old });
    // Un intento fallido de un número sin cuenta, igual de viejo: este sí se borra.
    await db.insert(accountEvent).values({ type: "whatsapp_link_failed", userId: null, phone: "573009990001", createdAt: old });

    expect(await runDailyCleanup(NOW)).toMatchObject({ events: 1 });
    const left = await db.select({ type: accountEvent.type }).from(accountEvent);
    expect(left).toEqual([{ type: "account_deleted" }]);
  });
});

describe("GET /api/cron/limpieza", () => {
  it.each([
    ["sin cabecera", undefined],
    ["con otro secreto", "Bearer otro-secreto"],
    ["sin Bearer", "secreto-del-cron"],
  ])("responde 401 %s y no borra nada", async (_, authorization) => {
    vi.stubEnv("CRON_SECRET", "secreto-del-cron");
    const ana = await createUser();
    await tx(ana.id, daysAgo(400));

    const response = await cron(authorization);
    expect(response.status).toBe(401);
    expect(await db.select().from(transaction)).toHaveLength(1);
    expect(await db.select().from(cronRun)).toEqual([]);
  });

  it("sin CRON_SECRET configurado, rechaza todo (no queda abierta por olvido)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron("Bearer ")).status).toBe(401);
    expect((await cron("Bearer undefined")).status).toBe(401);
  });

  it("con el secreto de Vercel Cron, limpia y responde las cantidades", async () => {
    vi.stubEnv("CRON_SECRET", "secreto-del-cron");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const ana = await createUser();
    await tx(ana.id, daysAgo(400));
    const kept = await tx(ana.id, null);

    const response = await cron("Bearer secreto-del-cron");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, messages: 0, events: 0, transactions: 1 });
    expect((await db.select({ id: transaction.id }).from(transaction)).map((row) => row.id)).toEqual([kept]);
    expect(info).toHaveBeenCalledWith("[limpieza] datos vencidos borrados", { messages: 0, events: 0, transactions: 1 });
    // La corrida queda para /admin/salud, con lo que borró.
    const [run] = await db.select().from(cronRun);
    expect(run).toMatchObject({ job: "limpieza", ok: true, result: { messages: 0, events: 0, transactions: 1 }, error: null });
    expect(run.finishedAt.getTime()).toBeGreaterThanOrEqual(run.startedAt.getTime());
  });

  it("si la limpieza falla, responde 500 y en el log solo va el tipo del error", async () => {
    vi.stubEnv("CRON_SECRET", "secreto-del-cron");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "delete").mockImplementation(() => {
      throw Object.assign(new Error("Failed query\nparams: 573001112233,gasté 80 mil"), { name: "DrizzleQueryError" });
    });

    const response = await cron("Bearer secreto-del-cron");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false });
    expect(error).toHaveBeenCalledWith("[limpieza] falló", "DrizzleQueryError");
    // La corrida queda como fallida, con el tipo del error y sin su mensaje (que trae datos de la consulta).
    expect(await db.select({ ok: cronRun.ok, result: cronRun.result, error: cronRun.error }).from(cronRun)).toEqual([
      { ok: false, result: null, error: "DrizzleQueryError" },
    ]);
  });

  it("si no puede guardar la corrida, igual responde lo que hizo la limpieza", async () => {
    vi.stubEnv("CRON_SECRET", "secreto-del-cron");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "insert").mockImplementation(() => {
      throw Object.assign(new Error("connection terminated"), { name: "PostgresError", code: "57P01" });
    });

    const response = await cron("Bearer secreto-del-cron");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(error).toHaveBeenCalledWith("[limpieza] no se pudo guardar la corrida", "PostgresError (57P01)");
  });
});

