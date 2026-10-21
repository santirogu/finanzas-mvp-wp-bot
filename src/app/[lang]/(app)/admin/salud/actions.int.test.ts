import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, whatsappMessage } from "@/db/schema";
import { requestLocale } from "../../../../../../test/integration/locale";

// Probar las conexiones del bot desde /admin/salud: la Server Action con la base de verdad. Se simulan la
// sesión y las consultas a Meta y a Anthropic (se prueban en sus módulos; aquí, lo que ve el admin).
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), refresh: vi.fn(), whatsapp: vi.fn(), claude: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/modules/whatsapp/client", async (original) => ({
  ...(await original<typeof import("@/modules/whatsapp/client")>()),
  checkWhatsAppConnection: mocks.whatsapp,
}));
vi.mock("@/modules/bot/claude-extractor", async (original) => ({
  ...(await original<typeof import("@/modules/bot/claude-extractor")>()),
  checkClaudeConnection: mocks.claude,
}));

const { testConnectionsAction } = await import("./actions");

async function seed() {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "admin", twoFactorEnabled: true });
}
const events = () => db.select().from(accountEvent);

describe("probar las conexiones", () => {
  it("muestra cada servicio legible y el último mensaje que llegó al webhook, sin cambiar nada", async () => {
    await seed();
    mocks.whatsapp.mockResolvedValue({ status: "ok", detail: "Finanzas MVP · +1 555-662-5913" });
    mocks.claude.mockResolvedValue({ status: "error", error: '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}' });
    await db.insert(whatsappMessage).values([
      { id: "wamid.viejo", phone: "573001112233", body: "x", receivedAt: new Date("2026-10-15T15:00:00Z") },
      { id: "wamid.nuevo", phone: "573001112233", body: "x", receivedAt: new Date("2026-10-16T23:00:00Z") },
    ]);

    const result = await testConnectionsAction();
    expect(result.whatsapp).toEqual({ ok: true, title: "Conectado", detail: "Finanzas MVP · +1 555-662-5913", warning: null });
    expect(result.claude).toMatchObject({ ok: false, title: "La API key de Claude no sirve: vencida, revocada o mal copiada", detail: "HTTP 401 · invalid x-api-key" });
    // 23:00 UTC es 6:00 p. m. en Colombia.
    expect(result.lastMessage).toBe("16 de oct de 2026, 6:00 p. m.");
    expect(result.checkedAt).toMatch(/^\d{1,2}:\d{2}\s[ap]\.\s?m\.$/);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(await events()).toEqual([]);
  });

  it("sin mensajes todavía, lo dice", async () => {
    await seed();
    mocks.whatsapp.mockResolvedValue({ status: "sin_configurar", missing: ["WHATSAPP_ACCESS_TOKEN"] });
    mocks.claude.mockResolvedValue({ status: "ok", detail: "Claude Haiku 5.5 (claude-haiku-5-5)" });
    const result = await testConnectionsAction();
    expect(result.lastMessage).toBeNull();
    expect(result.whatsapp).toMatchObject({ ok: false, title: "Falta configurar WHATSAPP_ACCESS_TOKEN" });
  });

  it("sin rol de admin no prueba nada", async () => {
    await seed();
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(testConnectionsAction()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.whatsapp).not.toHaveBeenCalled();
    expect(mocks.claude).not.toHaveBeenCalled();
  });
});

describe("en inglés (el idioma de quien hace el pedido)", () => {
  it("probar las conexiones: el resultado y las fechas en inglés", async () => {
    requestLocale.value = "en";
    await seed();
    mocks.whatsapp.mockResolvedValue({ status: "ok", detail: "Finanzas MVP", warning: { kind: "low_quality", quality: "YELLOW" } });
    mocks.claude.mockResolvedValue({ status: "sin_configurar", missing: ["ANTHROPIC_API_KEY"] });
    await db.insert(whatsappMessage).values({ id: "wamid.en", phone: "573001112233", body: "x", receivedAt: new Date("2026-10-16T23:00:00Z") });
    const result = await testConnectionsAction();
    expect(result.whatsapp).toEqual({
      ok: true,
      title: "Connected",
      detail: "Finanzas MVP",
      warning: "Meta rates the number's quality as YELLOW: it could limit sending.",
    });
    expect(result.claude).toMatchObject({ ok: false, title: "ANTHROPIC_API_KEY isn't set up" });
    expect(result.lastMessage).toBe("Oct 16, 2026, 6:00 PM");
    expect(result.checkedAt).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
  });
});
