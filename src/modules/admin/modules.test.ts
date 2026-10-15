import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_HOME,
  ADMIN_MODULES,
  ADMIN_MODULE_IDS,
  activeAdminModules,
  adminNavItems,
  isCurrentAdminItem,
} from "./modules";

const ADMIN_APP = resolve(__dirname, "../../app/(app)/admin");
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

  it("hoy están activos Historial y Seguridad; los demás vienen pronto", () => {
    expect(activeAdminModules().map((m) => m.id)).toEqual(["historial", "seguridad"]);
    expect(Object.fromEntries(ADMIN_MODULES.map((m) => [m.id, m.status]))).toEqual({
      historial: "activo",
      usuarios: "pronto",
      bot: "pronto",
      categorias: "pronto",
      salud: "pronto",
      configuracion: "pronto",
      seguridad: "activo",
    });
  });
});

describe("subnavegación", () => {
  it("Inicio primero y luego los módulos activos, en orden", () => {
    expect(ADMIN_HOME).toEqual({ label: "Inicio", href: "/admin" });
    expect(adminNavItems().map((i) => i.label)).toEqual(["Inicio", "Historial", "Seguridad"]);
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
  ])("isCurrentAdminItem(%s, %s) = %s", (href, pathname, expected) => {
    expect(isCurrentAdminItem(href, pathname)).toBe(expected);
  });
});
