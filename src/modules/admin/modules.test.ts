import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_HOME,
  ADMIN_MODULES,
  ADMIN_MODULE_IDS,
  activeAdminModules,
  adminModuleLabel,
  adminModules,
  adminNavItems,
  adminTitle,
  isCurrentAdminItem,
  onlyActive,
} from "./modules";

const ADMIN_APP = resolve(__dirname, "../../app/[lang]/(app)/admin");
const pageOf = (id: string) => join(ADMIN_APP, id, "page.tsx");

describe("registro de módulos de administración", () => {
  it("tiene los módulos acordados, en orden, con Seguridad al final", () => {
    expect(ADMIN_MODULES.map((m) => m.id)).toEqual([...ADMIN_MODULE_IDS]);
    expect(ADMIN_MODULES.map((m) => m.label)).toEqual([
      "Historial",
      "Usuarios",
      "Bot de WhatsApp",
      "Categorías",
      "Salud del sistema",
      "Configuración",
      "Seguridad",
    ]);
  });

  it("cada módulo vive en /admin/<id>, con nombre y descripción", () => {
    for (const adminModule of ADMIN_MODULES) {
      expect(adminModule.href, adminModule.id).toBe(`/admin/${adminModule.id}`);
      expect(adminModule.label.length, adminModule.id).toBeGreaterThan(0);
      expect(adminModule.description.length, adminModule.id).toBeGreaterThan(0);
    }
    expect(new Set(ADMIN_MODULES.map((m) => m.href)).size).toBe(ADMIN_MODULES.length);
  });

  it("cada módulo activo tiene su página y los que vienen todavía no", () => {
    for (const adminModule of ADMIN_MODULES) {
      expect(existsSync(pageOf(adminModule.id)), `${adminModule.id} (${adminModule.status})`).toBe(adminModule.status === "activo");
    }
  });

  it("no hay páginas de administración fuera del registro (además de Inicio)", () => {
    expect(existsSync(join(ADMIN_APP, "page.tsx"))).toBe(true);
    const folders = readdirSync(ADMIN_APP, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(pageOf(entry.name)))
      .map((entry) => entry.name)
      .sort();
    expect(folders).toEqual(activeAdminModules().map((m) => m.id).sort());
  });

  it("hoy están activos todos", () => {
    expect(activeAdminModules().map((m) => m.id)).toEqual([...ADMIN_MODULE_IDS]);
    expect(ADMIN_MODULES.filter((m) => m.status === "pronto")).toEqual([]);
  });

  it("de los que vienen, ninguno entra a la subnavegación (aunque hoy no haya)", () => {
    const modules = [{ id: "a", status: "activo" as const }, { id: "b", status: "pronto" as const }, { id: "c", status: "activo" as const }];
    expect(onlyActive(modules).map((m) => m.id)).toEqual(["a", "c"]);
  });
});

describe("subnavegación", () => {
  it("Inicio primero y luego los módulos activos, en orden", () => {
    expect(ADMIN_HOME).toEqual({ label: "Inicio", href: "/admin" });
    expect(adminNavItems().map((i) => i.label)).toEqual([
      "Inicio",
      "Historial",
      "Usuarios",
      "Bot de WhatsApp",
      "Categorías",
      "Salud del sistema",
      "Configuración",
      "Seguridad",
    ]);
  });

  it.each([
    ["/admin", "/admin", true],
    ["/admin", "/admin/historial", false],
    ["/admin/historial", "/admin/historial", true],
    ["/admin/historial", "/admin/historial/algo", true],
    ["/admin/historial", "/admin/historialx", false],
    ["/admin/seguridad", "/admin/historial", false],
    ["/admin", null, false],
    ["/admin/historial", null, false],
    ["/admin/usuarios", "/admin/usuarios/abc123", true],
    ["/admin/usuarios", "/admin/usuariosx", false],
  ])("isCurrentAdminItem(%s, %s) = %s", (href, pathname, expected) => {
    expect(isCurrentAdminItem(href, pathname)).toBe(expected);
  });
});

describe("en inglés", () => {
  it("los mismos módulos, rutas y estados, con su nombre y su frase en inglés", () => {
    const en = adminModules("en");
    expect(en.map(({ id, href, status }) => ({ id, href, status }))).toEqual(
      ADMIN_MODULES.map(({ id, href, status }) => ({ id, href, status })),
    );
    expect(en.map((m) => m.label)).toEqual(["History", "Users", "WhatsApp bot", "Categories", "System health", "Settings", "Security"]);
    expect(en.map((m) => m.description)).toEqual([
      "Sign-ups and WhatsApp linking of each account",
      "Accounts, sessions and status",
      "Messages, errors and Claude usage",
      "The income and expense categories",
      "Database, deployments and services",
      "Sign-ups, the notice for everyone and the values",
      "Your two-step verification",
    ]);
    expect(adminModules("es")).toBe(ADMIN_MODULES);
  });

  it("la subnavegación empieza en Home", () => {
    expect(adminNavItems("en").map((i) => i.label)).toEqual(["Home", "History", "Users", "WhatsApp bot", "Categories", "System health", "Settings", "Security"]);
    expect(adminNavItems("en")[0].href).toBe("/admin");
    expect(activeAdminModules("en").map((m) => m.id)).toEqual(activeAdminModules().map((m) => m.id));
  });

  it("el título de cada página", () => {
    expect(adminTitle(null)).toBe("Administración");
    expect(adminTitle("Usuarios")).toBe("Usuarios · Administración");
    expect(adminTitle(null, "en")).toBe("Administration");
    expect(adminTitle(adminModuleLabel("seguridad", "en"), "en")).toBe("Security · Administration");
    expect(adminModuleLabel("seguridad")).toBe("Seguridad");
  });
});
