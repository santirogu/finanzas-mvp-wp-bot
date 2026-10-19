import { describe, expect, it } from "vitest";
import { afterLoginPath, ROLES, ROLE_LABELS, hasRole, parseRole, isSuperAdmin, roleLabel, TWO_FACTOR_SETUP_PATH } from "./roles";

describe("ROLES", () => {
  it("son usuario y admin, en ese orden", () => {
    expect(ROLES).toEqual(["user", "admin"]);
  });
});

describe("ROLE_LABELS", () => {
  it("nombra cada rol en español", () => {
    expect(ROLE_LABELS).toEqual({ user: "Usuario", admin: "Administrador" });
  });
});

describe("parseRole", () => {
  it.each([
    ["admin", "admin"],
    ["user", "user"],
  ])("reconoce %j", (value, expected) => {
    expect(parseRole(value)).toBe(expected);
  });

  it.each([undefined, null, "", "ADMIN", "Admin", " admin", "admin ", "superadmin", "root", ["admin"], { role: "admin" }, 1, true])(
    "ante cualquier otra cosa (%j) devuelve usuario: nunca da más permisos de los debidos",
    (value) => {
      expect(parseRole(value)).toBe("user");
    },
  );
});

describe("hasRole", () => {
  it.each([
    ["admin", "admin", true],
    ["admin", "user", true],
    ["user", "user", true],
    ["user", "admin", false],
  ] as const)("%s puede lo que exige %s: %s", (role, required, expected) => {
    expect(hasRole(role, required)).toBe(expected);
  });
});

describe("isSuperAdmin", () => {
  it("es la marca con el rol de admin; la marca sola no alcanza", () => {
    expect(isSuperAdmin("admin", true)).toBe(true);
    expect(isSuperAdmin("admin", false)).toBe(false);
    expect(isSuperAdmin("user", true)).toBe(false);
    expect(isSuperAdmin("user", false)).toBe(false);
  });
});

describe("roleLabel", () => {
  it("Superadministrador para el super admin; si no, el nombre del rol", () => {
    expect(roleLabel("admin", true)).toBe("Superadministrador");
    expect(roleLabel("admin", false)).toBe("Administrador");
    expect(roleLabel("user", true)).toBe("Usuario");
    expect(roleLabel("user", false)).toBe("Usuario");
  });
});

describe("afterLoginPath", () => {
  it("un admin sin la verificación en dos pasos va a configurarla", () => {
    expect(TWO_FACTOR_SETUP_PATH).toBe("/admin/seguridad");
    expect(afterLoginPath({ role: "admin", twoFactorEnabled: false })).toBe("/admin/seguridad");
    expect(afterLoginPath({ role: "admin" })).toBe("/admin/seguridad");
  });

  it("los demás, a su Resumen", () => {
    expect(afterLoginPath({ role: "admin", twoFactorEnabled: true })).toBe("/dashboard");
    expect(afterLoginPath({ role: "user", twoFactorEnabled: false })).toBe("/dashboard");
    expect(afterLoginPath({ role: "superadmin", twoFactorEnabled: false })).toBe("/dashboard");
    expect(afterLoginPath({})).toBe("/dashboard");
    expect(afterLoginPath(null)).toBe("/dashboard");
    expect(afterLoginPath(undefined)).toBe("/dashboard");
  });

  it("solo true cuenta como verificación activa", () => {
    expect(afterLoginPath({ role: "admin", twoFactorEnabled: "true" })).toBe("/admin/seguridad");
  });
});
