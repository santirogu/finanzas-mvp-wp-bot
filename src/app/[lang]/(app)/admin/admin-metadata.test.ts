import { beforeEach, describe, expect, it, vi } from "vitest";

// El título de las páginas de la administración: solo para un admin. Next lo arma aparte, sin esperar al
// marco que responde 404 a los demás.
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getLocale: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/i18n/server", () => ({ getLocale: mocks.getLocale }));

const { adminMetadata } = await import("./admin-metadata");

const user = (role: string) => ({ id: "u", role, superAdmin: false, twoFactorEnabled: false });

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getLocale.mockReset().mockResolvedValue("es");
});

describe("adminMetadata", () => {
  it("para un admin (con o sin la verificación): la sección y Administración, en el idioma de la página", async () => {
    mocks.getCurrentUser.mockResolvedValue(user("admin"));
    expect(await adminMetadata("salud")).toEqual({ title: "Salud del sistema · Administración" });
    expect(await adminMetadata(null)).toEqual({ title: "Administración" });
    expect(await adminMetadata({ es: "Cuenta", en: "Account" })).toEqual({ title: "Cuenta · Administración" });
    mocks.getLocale.mockResolvedValue("en");
    expect(await adminMetadata("salud")).toEqual({ title: "System health · Administration" });
    expect(await adminMetadata({ es: "Cuenta", en: "Account" })).toEqual({ title: "Account · Administration" });
  });

  it("a un usuario normal o sin sesión no le llega ni el nombre de la sección", async () => {
    mocks.getCurrentUser.mockResolvedValue(user("user"));
    expect(await adminMetadata("salud")).toEqual({});
    mocks.getCurrentUser.mockResolvedValue(null);
    expect(await adminMetadata(null)).toEqual({});
    expect(mocks.getLocale).not.toHaveBeenCalled();
  });
});
