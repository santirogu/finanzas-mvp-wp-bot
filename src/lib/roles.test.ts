import { describe, expect, it } from "vitest";
import { ROLES, hasRole, parseRole } from "./roles";

describe("ROLES", () => {
  it("son usuario y admin, en ese orden", () => {
    expect(ROLES).toEqual(["user", "admin"]);
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
