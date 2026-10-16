import { describe, expect, it, vi } from "vitest";
import {
  AUTO_BACKUP_EVERY_MS,
  BACKUPS_TO_KEEP,
  backupDate,
  backupName,
  backupsOf,
  localTarget,
  runCli,
  type Deps,
} from "./db-backup";

// Las fechas se arman con la hora del equipo (como los nombres de las copias): así la prueba no
// depende de la zona horaria de quien la corre.
const NOW = new Date(2026, 9, 16, 16, 42, 5);
const LOCAL = "postgres://finanzas:finanzas@localhost:5432/finanzas";

function setup({
  env = { DATABASE_URL: LOCAL } as Record<string, string | undefined>,
  envError = null as string | null,
  backups = [] as string[],
  answer = "finanzas",
  dumpError = null as string | null,
  restoreError = null as string | null,
} = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  const files = [...backups];
  const deps = {
    loadEnv: vi.fn(() => envError),
    env: () => env,
    ask: vi.fn(async () => answer),
    log: (line: string) => logs.push(line),
    error: (line: string) => errors.push(line),
    now: () => NOW,
    listBackups: () => [...files],
    dump: vi.fn(async (_target, file: string) => {
      if (!dumpError) files.push(file);
      return dumpError;
    }),
    restore: vi.fn(async () => restoreError),
    remove: vi.fn((file: string) => void files.splice(files.indexOf(file), 1)),
  } satisfies Deps;
  return { deps, logs, errors, files, run: (...argv: string[]) => runCli(argv, deps) };
}

/** Copias de finanzas, una por día, terminando `daysAgo` días antes de NOW. */
const daily = (count: number, daysAgo = 1) =>
  Array.from({ length: count }, (_, i) => backupName("finanzas", new Date(NOW.getTime() - (daysAgo + count - 1 - i) * 86_400_000)));

describe("localTarget", () => {
  it.each([
    [LOCAL, { user: "finanzas", database: "finanzas" }],
    ["postgresql://yo:clave@127.0.0.1/mi%20base", { user: "yo", database: "mi base" }],
    ["postgres://a%40b:x@[::1]:5433/finanzas", { user: "a@b", database: "finanzas" }],
  ])("%s es de este equipo", (url, target) => {
    expect(localTarget(url)).toEqual(target);
  });

  it.each([
    "postgres://usuario:clave@ep-x.neon.tech:5432/neondb?sslmode=require",
    "postgres://usuario:clave@localhost.example.com/finanzas",
    "postgres://localhost:5432/finanzas",
    "postgres://finanzas:finanzas@localhost:5432/",
    "no es una url",
  ])("%s no", (url) => {
    expect(localTarget(url)).toBeNull();
  });
});

describe("nombres de las copias", () => {
  it("llevan la base y la fecha del equipo, y se leen de vuelta", () => {
    const name = backupName("finanzas", NOW);
    expect(name).toBe("finanzas-2026-10-16-164205.sql.gz");
    expect(backupDate("finanzas", name)).toEqual(NOW);
    expect(backupName("finanzas", new Date(2026, 0, 2, 3, 4, 5))).toBe("finanzas-2026-01-02-030405.sql.gz");
  });

  it("solo cuentan las de esa base, de la más vieja a la más nueva", () => {
    const names = [
      "finanzas-2026-10-16-090000.sql.gz",
      "finanzas_test-2026-10-15-090000.sql.gz",
      ".finanzas-2026-10-16-100000.sql.gz.parcial",
      "finanzas-2026-10-16-110000.sql.gz.bak",
      "finanzas-2026-10-14-090000.sql.gz",
      "notas.txt",
      "finanzas-2026-10-14.sql.gz",
    ];
    expect(backupsOf("finanzas", names)).toEqual(["finanzas-2026-10-14-090000.sql.gz", "finanzas-2026-10-16-090000.sql.gz"]);
    expect(backupDate("finanzas", "finanzas_test-2026-10-15-090000.sql.gz")).toBeNull();
  });
});

describe("pnpm db:backup", () => {
  it("guarda la copia con la fecha de ahora", async () => {
    const { run, deps, logs, errors } = setup();
    expect(await run("backup")).toBe(0);
    expect(deps.dump).toHaveBeenCalledWith({ user: "finanzas", database: "finanzas" }, "finanzas-2026-10-16-164205.sql.gz");
    expect(logs).toEqual(["✓ Copia guardada en backups/finanzas-2026-10-16-164205.sql.gz."]);
    expect(errors).toEqual([]);
  });

  it(`conserva las últimas ${BACKUPS_TO_KEEP} y borra las más viejas`, async () => {
    const old = daily(BACKUPS_TO_KEEP + 1);
    const { run, deps, files, logs } = setup({ backups: [...old, "otra-2020-01-01-000000.sql.gz"] });
    expect(await run("backup")).toBe(0);
    expect(deps.remove.mock.calls.map(([f]) => f)).toEqual(old.slice(0, 2));
    expect(backupsOf("finanzas", files)).toEqual([...old.slice(2), "finanzas-2026-10-16-164205.sql.gz"]);
    expect(files).toContain("otra-2020-01-01-000000.sql.gz");
    expect(logs[0]).toMatch(/\(se borraron 2 viejas\)\.$/);
  });

  it("si Docker no responde, lo dice y no borra ninguna", async () => {
    const { run, deps, errors } = setup({ backups: daily(BACKUPS_TO_KEEP + 3), dumpError: "Cannot connect to the Docker daemon" });
    expect(await run("backup")).toBe(1);
    expect(deps.remove).not.toHaveBeenCalled();
    expect(errors[0]).toBe(
      "No se pudo copiar la base: Cannot connect to the Docker daemon\n¿Está abierto Docker (o Rancher Desktop) y la base levantada con pnpm db:up?",
    );
  });

  it("nunca copia una base de otro servidor, como la de producción", async () => {
    const { run, deps, errors } = setup({ env: { DATABASE_URL: "postgres://u:clave@ep-x.neon.tech/neondb" } });
    expect(await run("backup")).toBe(2);
    expect(deps.dump).not.toHaveBeenCalled();
    expect(errors[0]).toMatch(/no es una base de este equipo \(localhost\)/);
    expect(errors.join()).not.toContain("clave");
  });

  it("sin DATABASE_URL (o sin .env), lo dice", async () => {
    for (const options of [{ env: {} }, { envError: "ENOENT" }]) {
      const { run, deps, errors } = setup(options);
      expect(await run("backup")).toBe(2);
      expect(deps.dump).not.toHaveBeenCalled();
      expect(errors).toEqual(["Falta DATABASE_URL en .env."]);
    }
  });
});

describe("la copia automática de pnpm dev", () => {
  it("se hace una vez al día: a las 23 horas de la última no, a las 25 sí", async () => {
    const hoursAgo = (hours: number) => backupName("finanzas", new Date(NOW.getTime() - hours * 3_600_000));
    expect(AUTO_BACKUP_EVERY_MS).toBe(24 * 3_600_000);
    const recent = setup({ backups: [hoursAgo(23)] });
    await recent.run("auto");
    expect(recent.deps.dump).not.toHaveBeenCalled();
    const old = setup({ backups: [hoursAgo(25)] });
    await old.run("auto");
    expect(old.deps.dump).toHaveBeenCalledTimes(1);
  });

  it("si la última tiene menos de un día, no hace nada", async () => {
    const recent = backupName("finanzas", new Date(NOW.getTime() - AUTO_BACKUP_EVERY_MS + 60_000));
    const { run, deps, logs } = setup({ backups: [...daily(3, 3), recent] });
    expect(await run("auto")).toBe(0);
    expect(deps.dump).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  it("si tiene un día o más (o no hay ninguna), copia y conserva las últimas", async () => {
    const dayOld = backupName("finanzas", new Date(NOW.getTime() - AUTO_BACKUP_EVERY_MS));
    const { run, deps, logs } = setup({ backups: [...daily(BACKUPS_TO_KEEP - 1, 2), dayOld] });
    expect(await run("auto")).toBe(0);
    expect(deps.dump).toHaveBeenCalledTimes(1);
    expect(deps.remove).toHaveBeenCalledTimes(1);
    expect(logs).toEqual(["✓ Copia diaria de la base local en backups/finanzas-2026-10-16-164205.sql.gz."]);

    const empty = setup();
    expect(await empty.run("auto")).toBe(0);
    expect(empty.deps.dump).toHaveBeenCalledTimes(1);
  });

  it("nunca frena el servidor: si falla, avisa y sigue", async () => {
    const { run, deps, errors } = setup({ dumpError: "no such service: db", backups: daily(BACKUPS_TO_KEEP + 2, 5) });
    expect(await run("auto")).toBe(0);
    expect(deps.remove).not.toHaveBeenCalled();
    expect(errors[0]).toMatch(/^⚠ No se hizo la copia diaria de la base local \(no such service: db\)\. ¿Está abierto Docker/);
  });

  it("con una base de otro servidor o sin .env, no hace nada ni se queja", async () => {
    for (const options of [{ env: { DATABASE_URL: "postgres://u:c@db.neon.tech/neondb" } }, { env: {} }, { envError: "ENOENT" }]) {
      const { run, deps, logs, errors } = setup(options);
      expect(await run("auto")).toBe(0);
      expect(deps.dump).not.toHaveBeenCalled();
      expect([...logs, ...errors]).toEqual([]);
    }
  });
});

describe("pnpm db:restore", () => {
  const backups = daily(3);

  it("sin archivo, usa la copia más reciente después de confirmar con el nombre de la base", async () => {
    const { run, deps, logs } = setup({ backups, answer: "  finanzas " });
    expect(await run("restore")).toBe(0);
    expect(deps.ask).toHaveBeenCalledWith("Para confirmar, escribe el nombre de la base (finanzas): ");
    expect(deps.restore).toHaveBeenCalledWith({ user: "finanzas", database: "finanzas" }, backups[2]);
    expect(logs).toEqual([
      `Copia: backups/${backups[2]}`,
      "Reemplaza todo lo que tiene ahora la base finanzas (cuentas, movimientos, mensajes) por esa copia.",
      "✓ La base finanzas quedó como en esa copia.",
    ]);
  });

  it("con un archivo, usa ese (también escrito con la carpeta)", async () => {
    for (const file of [backups[0], `backups/${backups[0]}`]) {
      const { run, deps } = setup({ backups });
      expect(await run("restore", file)).toBe(0);
      expect(deps.restore).toHaveBeenCalledWith(expect.anything(), backups[0]);
    }
  });

  it("si la respuesta no es el nombre de la base, no toca nada", async () => {
    const { run, deps, logs } = setup({ backups, answer: "si" });
    expect(await run("restore")).toBe(1);
    expect(deps.restore).not.toHaveBeenCalled();
    expect(logs.at(-1)).toBe("No coincide: no se cambió nada.");
  });

  it("una copia que no existe, o ninguna copia: lo dice sin preguntar", async () => {
    const missing = setup({ backups });
    expect(await missing.run("restore", "finanzas-2020-01-01-000000.sql.gz")).toBe(1);
    expect(missing.errors[0]).toBe(
      `No existe la copia backups/finanzas-2020-01-01-000000.sql.gz. Las que hay:\n${backups.map((b) => `  - ${b}`).join("\n")}`,
    );
    const other = setup({ backups: ["otra-2026-10-16-090000.sql.gz"] });
    expect(await other.run("restore", "otra-2026-10-16-090000.sql.gz")).toBe(1);
    expect(other.errors[0]).toMatch(/Las que hay:\n {2}\(ninguna\)$/);

    const none = setup();
    expect(await none.run("restore")).toBe(1);
    expect(none.errors).toEqual(["No hay copias de finanzas en backups/. Haz una con pnpm db:backup."]);
    for (const s of [missing, other, none]) expect(s.deps.ask).not.toHaveBeenCalled();
  });

  it("si falla al restaurar, lo dice", async () => {
    const { run, errors } = setup({ backups, restoreError: 'ERROR:  relation "x" does not exist' });
    expect(await run("restore")).toBe(1);
    expect(errors[0]).toMatch(/^No se pudo restaurar: ERROR: {2}relation "x" does not exist\n¿Está abierto Docker/);
  });

  it("nunca pisa una base de otro servidor", async () => {
    const { run, deps } = setup({ backups, env: { DATABASE_URL: "postgres://u:c@ep-x.neon.tech/neondb" } });
    expect(await run("restore")).toBe(2);
    expect(deps.ask).not.toHaveBeenCalled();
    expect(deps.restore).not.toHaveBeenCalled();
  });
});

describe("argumentos", () => {
  it.each([[[]], [["backup", "x"]], [["auto", "x"]], [["restore", "a", "b"]], [["borrar"]], [["backup", "--forzar"]]])(
    "%j muestra el uso",
    async (argv) => {
      const { deps, errors } = setup();
      expect(await runCli(argv, deps)).toBe(2);
      expect(errors[0]).toMatch(/Uso:\n {2}pnpm db:backup {14}copia la base local en backups\/\n {2}pnpm db:restore \[archivo\]/);
      expect(deps.loadEnv).not.toHaveBeenCalled();
    },
  );
});
