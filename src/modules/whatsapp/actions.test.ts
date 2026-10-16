import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createLinkCode: vi.fn(),
  unlinkUser: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("./link", () => ({
  createLinkCode: mocks.createLinkCode,
  unlinkUser: mocks.unlinkUser,
  LinkCodeLimitError: class LinkCodeLimitError extends Error {},
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

const { generateLinkCodeAction, unlinkWhatsAppAction } = await import("./actions");

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireUser.mockResolvedValue({ id: "u1" });
});

describe("acciones de WhatsApp", () => {
  it("genera el código para el usuario de la sesión y lo devuelve serializable", async () => {
    mocks.createLinkCode.mockResolvedValue({
      code: "482913",
      expiresAt: new Date("2026-10-13T20:10:00Z"),
    });

    expect(await generateLinkCodeAction()).toEqual({
      ok: true,
      code: "482913",
      expiresAt: "2026-10-13T20:10:00.000Z",
    });
    expect(mocks.createLinkCode).toHaveBeenCalledWith("u1");
  });

  it("si ya pidió demasiados códigos, devuelve el mensaje en vez de fallar", async () => {
    const { LinkCodeLimitError } = await import("./link");
    mocks.createLinkCode.mockRejectedValue(Object.assign(new LinkCodeLimitError(), { message: "Ya generaste varios códigos." }));
    expect(await generateLinkCodeAction()).toEqual({ ok: false, error: "Ya generaste varios códigos." });
  });

  it("cualquier otro error sigue su curso", async () => {
    mocks.createLinkCode.mockRejectedValue(new Error("se cayó la base"));
    await expect(generateLinkCodeAction()).rejects.toThrow("se cayó la base");
  });

  it("desvincula al usuario de la sesión y refresca la página", async () => {
    await unlinkWhatsAppAction();

    expect(mocks.unlinkUser).toHaveBeenCalledWith("u1");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("sin sesión no hace nada", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(generateLinkCodeAction()).rejects.toThrow("NEXT_REDIRECT");
    await expect(unlinkWhatsAppAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.createLinkCode).not.toHaveBeenCalled();
    expect(mocks.unlinkUser).not.toHaveBeenCalled();
  });
});
