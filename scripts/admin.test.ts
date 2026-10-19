import { describe, expect, it, vi } from "vitest";
import type { AccountRole } from "../src/modules/account/terminal";
import { runCli, type Deps, type RoleOps } from "./admin";

const ANA: AccountRole = {
  id: "user-ana",
  name: "Ana Pérez",
  email: "ana@correo.com",
  timezone: "America/Bogota",
  role: "user",
  superAdmin: false,
  twoFactorEnabled: false,
  // En Colombia todavía es el 1 de septiembre (en UTC ya es el 2).
  createdAt: new Date("2026-09-02T03:00:00Z"),
};

const USAGE = [
  "Uso:",
  "  pnpm admin:grant [--env <archivo>] <correo>",
  "  pnpm admin:revoke [--env <archivo>] <correo>",
  "  pnpm admin:super [--env <archivo>] <correo>",
  "  pnpm admin:list [--env <archivo>]",
  "  pnpm admin:reset-2fa [--env <archivo>] <correo>",
].join("\n");

function setup({
  account = ANA as AccountRole | null,
  admins = [] as AccountRole[],
  answer = "",
  updated = { sessionsClosed: 2 } as { sessionsClosed: number } | null,
  marked = true,
  reset = { sessionsClosed: 2 } as { sessionsClosed: number } | null,
  env = { DATABASE_URL: "postgres://usuario:clave-secreta@db.neon.tech:5432/finanzas" } as Record<string, string>,
} = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  const data = {
    findAccountRole: vi.fn(async () => account),
    setRole: vi.fn(async () => updated),
    setSuperAdmin: vi.fn(async () => marked),
    listAdmins: vi.fn(async () => admins),
    resetTwoFactor: vi.fn(async () => reset),
    close: vi.fn(async () => {}),
  } satisfies RoleOps;
  const deps = {
    loadEnv: vi.fn(() => null),
    env: () => env,
    openData: vi.fn(async () => data),
    ask: vi.fn(async () => answer),
    log: (line: string) => logs.push(line),
    error: (line: string) => errors.push(line),
  } satisfies Deps;
  const run = (...argv: string[]) => runCli(argv, deps);
  return { run, data, deps, logs, errors };
}

describe("argumentos", () => {
  it.each([
    [[]],
    [["grant"]],
    [["revoke"]],
    [["grant", "a@b.co", "otro@b.co"]],
    [["list", "a@b.co"]],
    [["promote", "a@b.co"]],
    [["grant", "a@b.co", "--rol", "admin"]],
    [["grant", "--env"]],
    [["reset-2fa"]],
    [["reset-2fa", "a@b.co", "otro@b.co"]],
    [["super"]],
    [["super", "a@b.co", "otro@b.co"]],
  ])("con %j explica el uso y no abre la base", async (argv) => {
    const { run, deps, errors } = setup();
    expect(await run(...argv)).toBe(2);
    expect(errors.join("\n")).toContain(USAGE);
    expect(deps.loadEnv).not.toHaveBeenCalled();
    expect(deps.openData).not.toHaveBeenCalled();
  });

  it("el mensaje de uso es exactamente el esperado", async () => {
    const { run, errors } = setup();
    await run();
    expect(errors).toEqual([USAGE]);
  });

  it("sin DATABASE_URL no abre la base", async () => {
    const { run, deps, errors } = setup({ env: {} });
    expect(await run("grant", "ana@correo.com")).toBe(2);
    expect(errors).toEqual(["Falta DATABASE_URL en .env."]);
    expect(deps.openData).not.toHaveBeenCalled();
  });

  it("acepta --env en cualquier posición", async () => {
    const { run, deps } = setup({ answer: "ana@correo.com" });
    expect(await run("grant", "ana@correo.com", "--env", ".env.produccion")).toBe(0);
    expect(deps.loadEnv).toHaveBeenCalledWith(".env.produccion");
  });
});

describe("admin:grant", () => {
  it("muestra la base, la cuenta y el cambio, y da el rol solo si se escribe el correo", async () => {
    const { run, data, deps, logs, errors } = setup({ answer: "  ANA@correo.com " });

    expect(await run("grant", "Ana@Correo.com")).toBe(0);

    expect(data.findAccountRole).toHaveBeenCalledWith("Ana@Correo.com");
    expect(deps.ask).toHaveBeenCalledWith("Para confirmar, escribe el correo de la cuenta: ");
    expect(data.setRole).toHaveBeenCalledWith("user-ana", "admin");
    expect(data.listAdmins).not.toHaveBeenCalled();
    expect(data.close).toHaveBeenCalledOnce();
    expect(errors).toEqual([]);
    expect(logs).toEqual([
      "Base de datos: db.neon.tech:5432/finanzas",
      "Cuenta: Ana Pérez <ana@correo.com>, creada el 2026-09-01",
      "Rol: usuario → admin",
      "Un admin ve la sección de administración, con datos de todas las cuentas.",
      "Se cierran sus sesiones: al volver a entrar tendrá que configurar la verificación en dos pasos.",
      "✓ ana@correo.com ahora tiene el rol admin. Sesiones cerradas: 2.",
    ]);
    expect([...logs, ...errors].join("\n")).not.toContain("clave-secreta");
  });

  it.each(["", "si", "ELIMINAR", "ana@correo.co", "otra@correo.com"])(
    "si la confirmación (%j) no es el correo, no cambia nada",
    async (answer) => {
      const { run, data, logs } = setup({ answer });
      expect(await run("grant", "ana@correo.com")).toBe(1);
      expect(data.setRole).not.toHaveBeenCalled();
      expect(data.close).toHaveBeenCalledOnce();
      expect(logs.at(-1)).toBe("El correo no coincide: no se cambió nada.");
    },
  );

  it("si la cuenta no existe, explica que primero hay que registrarse y no pregunta nada", async () => {
    const { run, data, deps, errors } = setup({ account: null });
    expect(await run("grant", " Nadie@Correo.com ")).toBe(1);
    expect(errors).toEqual([
      "No hay ninguna cuenta con el correo nadie@correo.com. Primero hay que registrarse en la app con ese correo. No se cambió nada.",
    ]);
    expect(deps.ask).not.toHaveBeenCalled();
    expect(data.setRole).not.toHaveBeenCalled();
    expect(data.close).toHaveBeenCalledOnce();
  });

  it("si ya es admin, lo dice y no pregunta nada", async () => {
    const { run, data, deps, logs } = setup({ account: { ...ANA, role: "admin" } });
    expect(await run("grant", "ana@correo.com")).toBe(0);
    expect(logs.at(-1)).toBe("ana@correo.com ya tiene el rol admin. No se cambió nada.");
    expect(deps.ask).not.toHaveBeenCalled();
    expect(data.setRole).not.toHaveBeenCalled();
  });

  it("si la cuenta se borra mientras se confirmaba, lo dice", async () => {
    const { run, errors, logs } = setup({ answer: "ana@correo.com", updated: null });
    expect(await run("grant", "ana@correo.com")).toBe(1);
    expect(errors).toEqual(["La cuenta ya no existe (¿se borró mientras tanto?). No se cambió nada."]);
    expect(logs.join("\n")).not.toContain("✓");
  });

  it("si la base falla, cierra la conexión igual y deja ver el error", async () => {
    const { run, data } = setup({ answer: "ana@correo.com" });
    data.setRole.mockRejectedValue(new Error("se cayó la base"));
    await expect(run("grant", "ana@correo.com")).rejects.toThrow("se cayó la base");
    expect(data.close).toHaveBeenCalledOnce();
  });
});

describe("admin:revoke", () => {
  const ADMIN_ANA = { ...ANA, role: "admin" as const };

  it("quita el rol tras confirmar, sin el aviso de lo que ve un admin", async () => {
    const { run, data, logs } = setup({
      account: ADMIN_ANA,
      answer: "ana@correo.com",
      admins: [{ ...ANA, id: "user-beto", email: "beto@correo.com", role: "admin" }],
    });

    expect(await run("revoke", "ana@correo.com")).toBe(0);

    expect(data.setRole).toHaveBeenCalledWith("user-ana", "user");
    expect(logs).toEqual([
      "Base de datos: db.neon.tech:5432/finanzas",
      "Cuenta: Ana Pérez <ana@correo.com>, creada el 2026-09-01",
      "Rol: admin → usuario",
      "Se borran su verificación en dos pasos y sus códigos de respaldo, y se cierran sus sesiones.",
      "✓ ana@correo.com ahora tiene el rol usuario. Sesiones cerradas: 2.",
    ]);
  });

  it("al super admin también le quita la marca, y avisa que ya no hay super admin", async () => {
    const { run, data, logs } = setup({
      account: { ...ADMIN_ANA, superAdmin: true },
      answer: "ana@correo.com",
      admins: [{ ...ANA, id: "user-beto", email: "beto@correo.com", role: "admin" }],
    });
    expect(await run("revoke", "ana@correo.com")).toBe(0);
    expect(data.setRole).toHaveBeenCalledWith("user-ana", "user");
    expect(logs).toContain("Es el super admin: también pierde esa marca.");
    expect(logs.at(-1)).toBe("Ya no hay super admin. Para poner uno: pnpm admin:super <correo>.");
  });

  it("avisa si ya no queda ningún admin", async () => {
    const { run, logs } = setup({ account: ADMIN_ANA, answer: "ana@correo.com", admins: [] });
    expect(await run("revoke", "ana@correo.com")).toBe(0);
    expect(logs.at(-1)).toBe("Ya no queda ningún admin. Puedes volver a dar el rol con pnpm admin:grant.");
  });

  it("si no es admin, lo dice y no pregunta nada", async () => {
    const { run, data, deps, logs } = setup();
    expect(await run("revoke", "ana@correo.com")).toBe(0);
    expect(logs.at(-1)).toBe("ana@correo.com ya tiene el rol usuario. No se cambió nada.");
    expect(deps.ask).not.toHaveBeenCalled();
    expect(data.setRole).not.toHaveBeenCalled();
  });

  it("sin confirmar no quita nada", async () => {
    const { run, data } = setup({ account: ADMIN_ANA, answer: "no" });
    expect(await run("revoke", "ana@correo.com")).toBe(1);
    expect(data.setRole).not.toHaveBeenCalled();
  });
});

describe("admin:super", () => {
  const ADMIN_ANA = { ...ANA, role: "admin" as const };
  const BETO = { ...ANA, id: "user-beto", name: "Beto", email: "beto@correo.com", role: "admin" as const };

  it("muestra quién lo era y quién lo será, y marca la cuenta tras confirmar", async () => {
    const { run, data, deps, logs, errors } = setup({
      account: ADMIN_ANA,
      answer: " ANA@correo.com",
      admins: [ADMIN_ANA, { ...BETO, superAdmin: true }],
    });
    expect(await run("super", "Ana@Correo.com")).toBe(0);
    expect(deps.ask).toHaveBeenCalledWith("Para confirmar, escribe el correo de la cuenta: ");
    expect(data.setSuperAdmin).toHaveBeenCalledWith("user-ana");
    expect(data.setRole).not.toHaveBeenCalled();
    expect(data.close).toHaveBeenCalledOnce();
    expect(errors).toEqual([]);
    expect(logs).toEqual([
      "Base de datos: db.neon.tech:5432/finanzas",
      "Cuenta: Ana Pérez <ana@correo.com>, creada el 2026-09-01",
      "Super admin: beto@correo.com → ana@correo.com",
      "El super admin da y quita el rol de admin desde la app, con su código de Google Authenticator. Hay uno solo.",
      "✓ ana@correo.com ahora es el super admin.",
    ]);
  });

  it("si no había ninguno, lo dice", async () => {
    const { run, logs } = setup({ account: ADMIN_ANA, answer: "ana@correo.com", admins: [ADMIN_ANA] });
    expect(await run("super", "ana@correo.com")).toBe(0);
    expect(logs).toContain("Super admin: ninguno → ana@correo.com");
  });

  it("si no es admin, explica que primero hay que darle el rol y no pregunta nada", async () => {
    const { run, data, deps, errors } = setup();
    expect(await run("super", "ana@correo.com")).toBe(1);
    expect(errors).toEqual(["ana@correo.com no es admin: primero dale el rol con pnpm admin:grant. No se cambió nada."]);
    expect(deps.ask).not.toHaveBeenCalled();
    expect(data.setSuperAdmin).not.toHaveBeenCalled();
  });

  it("si ya lo es, lo dice y no pregunta nada", async () => {
    const { run, data, deps, logs } = setup({ account: { ...ADMIN_ANA, superAdmin: true } });
    expect(await run("super", "ana@correo.com")).toBe(0);
    expect(logs.at(-1)).toBe("ana@correo.com ya es el super admin. No se cambió nada.");
    expect(deps.ask).not.toHaveBeenCalled();
    expect(data.setSuperAdmin).not.toHaveBeenCalled();
  });

  it("si la cuenta no existe, lo dice", async () => {
    const { run, data, errors } = setup({ account: null });
    expect(await run("super", "nadie@correo.com")).toBe(1);
    expect(errors).toEqual(["No hay ninguna cuenta con el correo nadie@correo.com. No se cambió nada."]);
    expect(data.setSuperAdmin).not.toHaveBeenCalled();
  });

  it("sin confirmar no marca nada", async () => {
    const { run, data, logs } = setup({ account: ADMIN_ANA, answer: "beto@correo.com" });
    expect(await run("super", "ana@correo.com")).toBe(1);
    expect(data.setSuperAdmin).not.toHaveBeenCalled();
    expect(logs.at(-1)).toBe("El correo no coincide: no se cambió nada.");
  });

  it("si mientras tanto dejó de ser admin (o se borró), no cambia nada y lo dice", async () => {
    const { run, errors, logs } = setup({ account: ADMIN_ANA, answer: "ana@correo.com", marked: false });
    expect(await run("super", "ana@correo.com")).toBe(1);
    expect(errors).toEqual(["La cuenta ya no existe o ya no es admin (¿cambió mientras tanto?). No se cambió nada."]);
    expect(logs.join("\n")).not.toContain("✓");
  });

  it("acepta --env", async () => {
    const { run, deps } = setup({ account: ADMIN_ANA, answer: "ana@correo.com" });
    expect(await run("super", "--env", ".env.produccion", "ana@correo.com")).toBe(0);
    expect(deps.loadEnv).toHaveBeenCalledWith(".env.produccion");
  });
});

describe("admin:list", () => {
  it("muestra los admins con su fecha de creación y si tienen la verificación en dos pasos", async () => {
    const { run, deps, data, logs } = setup({
      admins: [
        { ...ANA, role: "admin", twoFactorEnabled: true, superAdmin: true },
        { ...ANA, id: "b", name: "Beto", email: "beto@correo.com", role: "admin", createdAt: new Date("2026-10-01T15:00:00Z") },
      ],
    });
    expect(await run("list")).toBe(0);
    expect(logs).toEqual([
      "Base de datos: db.neon.tech:5432/finanzas",
      "Admins (2):",
      "  - Ana Pérez <ana@correo.com>, creada el 2026-09-01 · verificación en dos pasos activa · super admin",
      "  - Beto <beto@correo.com>, creada el 2026-10-01 · verificación en dos pasos pendiente",
    ]);
    expect(deps.ask).not.toHaveBeenCalled();
    expect(data.setRole).not.toHaveBeenCalled();
    expect(data.close).toHaveBeenCalledOnce();
  });

  it("sin admins explica cómo crear uno", async () => {
    const { run, logs } = setup();
    expect(await run("list", "--env", ".env.produccion")).toBe(0);
    expect(logs.at(-1)).toBe("No hay ningún admin. Para crear uno: pnpm admin:grant <correo>.");
  });
});

describe("admin:reset-2fa", () => {
  const WITH_2FA = { ...ANA, role: "admin" as const, twoFactorEnabled: true };

  it("explica qué pasa, pide el correo y reinicia la verificación", async () => {
    const { run, data, deps, logs, errors } = setup({ account: WITH_2FA, answer: " ANA@correo.com" });

    expect(await run("reset-2fa", "ana@correo.com")).toBe(0);

    expect(deps.ask).toHaveBeenCalledWith("Para confirmar, escribe el correo de la cuenta: ");
    expect(data.resetTwoFactor).toHaveBeenCalledWith("user-ana");
    expect(data.setRole).not.toHaveBeenCalled();
    expect(data.close).toHaveBeenCalledOnce();
    expect(errors).toEqual([]);
    expect(logs).toEqual([
      "Base de datos: db.neon.tech:5432/finanzas",
      "Cuenta: Ana Pérez <ana@correo.com>, creada el 2026-09-01",
      "Verificación en dos pasos: activa → desactivada (se borran la clave y los códigos de respaldo)",
      "Se cierran todas sus sesiones. Para volver a administrar tendrá que entrar y configurarla de nuevo.",
      "✓ Verificación en dos pasos de ana@correo.com reiniciada. Sesiones cerradas: 2.",
    ]);
  });

  it.each(["", "no", "ana@correo.co"])("sin confirmar (%j) no reinicia nada", async (answer) => {
    const { run, data, logs } = setup({ account: WITH_2FA, answer });
    expect(await run("reset-2fa", "ana@correo.com")).toBe(1);
    expect(data.resetTwoFactor).not.toHaveBeenCalled();
    expect(logs.at(-1)).toBe("El correo no coincide: no se cambió nada.");
  });

  it("si no la tiene activa, lo dice y no pregunta nada", async () => {
    const { run, data, deps, logs } = setup({ account: { ...WITH_2FA, twoFactorEnabled: false } });
    expect(await run("reset-2fa", "ana@correo.com")).toBe(0);
    expect(logs.at(-1)).toBe("ana@correo.com no tiene la verificación en dos pasos activa. No se cambió nada.");
    expect(deps.ask).not.toHaveBeenCalled();
    expect(data.resetTwoFactor).not.toHaveBeenCalled();
  });

  it("si la cuenta no existe, lo dice", async () => {
    const { run, data, errors } = setup({ account: null });
    expect(await run("reset-2fa", " Nadie@Correo.com")).toBe(1);
    expect(errors).toEqual(["No hay ninguna cuenta con el correo nadie@correo.com. No se cambió nada."]);
    expect(data.resetTwoFactor).not.toHaveBeenCalled();
  });

  it("si la cuenta se borra mientras se confirmaba, lo dice", async () => {
    const { run, errors, logs } = setup({ account: WITH_2FA, answer: "ana@correo.com", reset: null });
    expect(await run("reset-2fa", "ana@correo.com")).toBe(1);
    expect(errors).toEqual(["La cuenta ya no existe (¿se borró mientras tanto?). No se cambió nada."]);
    expect(logs.join("\n")).not.toContain("✓");
  });

  it("acepta --env", async () => {
    const { run, deps } = setup({ account: WITH_2FA, answer: "ana@correo.com" });
    expect(await run("reset-2fa", "--env", ".env.produccion", "ana@correo.com")).toBe(0);
    expect(deps.loadEnv).toHaveBeenCalledWith(".env.produccion");
  });
});
