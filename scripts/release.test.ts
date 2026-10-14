import { afterEach, describe, expect, it, vi } from "vitest";
import { FIRST_VERSION, SECTIONS, nextVersion, parseCommit, releaseNotes, runCli } from "./release.mjs";

const commit = (subject: string) => parseCommit(subject);

describe("parseCommit", () => {
  it("separa tipo, ámbito, descripción y número de PR", () => {
    expect(parseCommit("feat(auth): bloquear la cuenta tras varios intentos (#31)")).toEqual({
      type: "feat",
      scope: "auth",
      breaking: false,
      description: "bloquear la cuenta tras varios intentos",
      pr: "31",
    });
  });

  it("sin ámbito ni número de PR", () => {
    expect(parseCommit("docs: explicar el flujo de PRs")).toEqual({
      type: "docs",
      scope: null,
      breaking: false,
      description: "explicar el flujo de PRs",
      pr: null,
    });
  });

  it("reconoce los cambios incompatibles", () => {
    expect(parseCommit("feat(auth)!: exigir verificación del correo (#40)")).toMatchObject({
      type: "feat",
      breaking: true,
      pr: "40",
    });
  });

  it("solo toma como PR el número entre paréntesis al final", () => {
    expect(parseCommit("fix: no romper con (#12) en medio")).toMatchObject({
      description: "no romper con (#12) en medio",
      pr: null,
    });
    expect(parseCommit("fix: algo (#7)  ")).toMatchObject({ description: "algo", pr: "7" });
  });

  it("los commits que no siguen Conventional Commits quedan sin tipo y con el texto completo", () => {
    expect(parseCommit("Merge pull request #2 from santirogu/docs/ramas")).toEqual({
      type: null,
      scope: null,
      breaking: false,
      description: "Merge pull request #2 from santirogu/docs/ramas",
      pr: null,
    });
    expect(parseCommit("Primera versión (#3)")).toEqual({
      type: null,
      scope: null,
      breaking: false,
      description: "Primera versión",
      pr: "3",
    });
  });
});

describe("nextVersion", () => {
  it(`la primera release es la ${FIRST_VERSION}, sin importar los cambios`, () => {
    expect(FIRST_VERSION).toBe("1.0.0");
    expect(nextVersion(null, [commit("feat!: todo nuevo")])).toBe("1.0.0");
    expect(nextVersion(null, [])).toBe("1.0.0");
  });

  it.each([
    ["un cambio incompatible sube la mayor", ["fix: algo", "feat(auth)!: exigir el correo", "feat: otra"], "2.0.0"],
    ["una funcionalidad sube la menor", ["fix: algo", "feat(bot): notas de voz", "docs: x"], "1.3.0"],
    ["las correcciones suben el parche", ["fix: algo", "fix(web): otra"], "1.2.4"],
    ["el mantenimiento también sube el parche", ["chore(deps): actualizar next", "ci: x", "test: y"], "1.2.4"],
    ["los commits sin formato suben el parche", ["Arreglo rápido"], "1.2.4"],
  ])("%s", (_, subjects, expected) => {
    expect(nextVersion("1.2.3", subjects.map(commit))).toBe(expected);
  });

  it("compara números, no texto", () => {
    expect(nextVersion("1.9.9", [commit("fix: x")])).toBe("1.9.10");
    expect(nextVersion("1.9.9", [commit("feat: x")])).toBe("1.10.0");
    expect(nextVersion("9.9.9", [commit("feat!: x")])).toBe("10.0.0");
  });
});

describe("releaseNotes", () => {
  const commits = [
    "chore(deps): actualizar next (#40)",
    "feat(web): editar ingresos y egresos (#36)",
    "fix: corregir el redondeo (#35)",
    "perf(db): agregar un índice (#34)",
    "feat(auth)!: exigir verificación del correo (#33)",
    "test: probar el bot de punta a punta (#32)",
    "Commit inicial",
    "feat(bot): notas de voz (#31)",
  ].map(commit);

  it("agrupa por sección en orden y deja cada commit en la primera que le corresponde", () => {
    expect(releaseNotes({ version: "2.0.0", previousTag: "v1.4.0", commits, repository: "dueño/repo" })).toBe(
      [
        "### ⚠️ Cambios incompatibles",
        "",
        "- **auth:** exigir verificación del correo (#33)",
        "",
        "### ✨ Funcionalidades",
        "",
        "- **web:** editar ingresos y egresos (#36)",
        "- **bot:** notas de voz (#31)",
        "",
        "### 🐛 Correcciones",
        "",
        "- corregir el redondeo (#35)",
        "",
        "### ⚡ Rendimiento",
        "",
        "- **db:** agregar un índice (#34)",
        "",
        "### 🧰 Mantenimiento",
        "",
        "- **deps:** actualizar next (#40)",
        "- **test:** probar el bot de punta a punta (#32)",
        "",
        "### 📦 Otros cambios",
        "",
        "- Commit inicial",
        "",
        "**Cambios completos:** https://github.com/dueño/repo/compare/v1.4.0...v2.0.0",
        "",
      ].join("\n"),
    );
  });

  it("omite las secciones vacías", () => {
    const notes = releaseNotes({
      version: "1.0.1",
      previousTag: "v1.0.0",
      commits: [commit("fix(web): algo (#9)")],
      repository: "dueño/repo",
    });
    expect(notes).toBe(
      "### 🐛 Correcciones\n\n- **web:** algo (#9)\n\n" +
        "**Cambios completos:** https://github.com/dueño/repo/compare/v1.0.0...v1.0.1\n",
    );
  });

  it("la primera release se presenta como tal y no tiene enlace de comparación", () => {
    const notes = releaseNotes({
      version: "1.0.0",
      previousTag: null,
      commits: [commit("feat: algo")],
      repository: "dueño/repo",
    });
    expect(notes).toBe(
      "Primera versión publicada: todo lo que tiene la app hasta hoy.\n\n### ✨ Funcionalidades\n\n- algo\n",
    );
  });

  it("sin repositorio no agrega el enlace de comparación", () => {
    const notes = releaseNotes({ version: "1.0.1", previousTag: "v1.0.0", commits: [commit("fix: x")] });
    expect(notes).not.toContain("Cambios completos");
  });

  it("cada sección tiene título", () => {
    expect(SECTIONS.map((s) => s.title)).toEqual([
      "⚠️ Cambios incompatibles",
      "✨ Funcionalidades",
      "🐛 Correcciones",
      "⚡ Rendimiento",
      "🧰 Mantenimiento",
      "📦 Otros cambios",
    ]);
  });
});

describe("runCli", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const DESCRIBE = ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.[0-9]*"];

  /** git simulado: devuelve el último tag (o falla si no hay) y los commits del rango pedido. */
  function fakeGit({ tag, log }: { tag: string | null; log: string }) {
    return vi.fn((args: string[]) => {
      if (args[0] === "describe") {
        if (!tag) throw new Error("fatal: No names found, cannot describe anything.");
        return tag;
      }
      if (args[0] === "log") return log;
      throw new Error(`git ${args.join(" ")} no esperado`);
    });
  }

  function run(argv: string[], git: ReturnType<typeof fakeGit>, options = {}) {
    const logs: string[] = [];
    const errors: string[] = [];
    const files: Record<string, string> = {};
    const outputs: string[] = [];
    const code = runCli(argv, {
      git,
      writeFile: (file: string, text: string) => {
        files[file] = text;
      },
      append: (file: string, text: string) => {
        outputs.push(`${file}:${text}`);
      },
      outputFile: "salida.txt",
      repository: "dueño/repo",
      log: (m: string) => logs.push(m),
      error: (m: string) => errors.push(m),
      ...options,
    });
    return { code, logs, errors, files, outputs };
  }

  it("sin --notes explica el uso y sale con 2 sin tocar git", () => {
    const git = fakeGit({ tag: null, log: "" });
    for (const argv of [[], ["--notes"], ["--otra", "x"]]) {
      const { code, errors, outputs } = run(argv, git);
      expect(code).toBe(2);
      expect(errors).toEqual(["Uso: node scripts/release.mjs --notes <archivo>"]);
      expect(outputs).toEqual([]);
    }
    expect(git).not.toHaveBeenCalled();
  });

  it("sin tags, prepara la primera release con todo el historial", () => {
    const git = fakeGit({ tag: null, log: "feat(web): editar (#36)\nfix: algo (#35)\n" });
    const { code, logs, files, outputs } = run(["--notes", "notas.md"], git);

    expect(code).toBe(0);
    expect(git).toHaveBeenCalledWith(DESCRIBE);
    expect(git).toHaveBeenCalledWith(["log", "--format=%s", "HEAD"]);
    expect(logs).toEqual(["Release v1.0.0: 2 cambios."]);
    expect(files["notas.md"]).toMatch(/^Primera versión publicada/);
    expect(files["notas.md"]).toContain("- **web:** editar (#36)");
    expect(outputs).toEqual(["salida.txt:release=true\n", "salida.txt:version=1.0.0\n", "salida.txt:tag=v1.0.0\n"]);
  });

  it("con un tag anterior, usa solo los commits desde ese tag", () => {
    const git = fakeGit({ tag: "v1.2.3", log: "fix(bot): algo (#41)\n\nchore: otra (#42)" });
    const { code, logs, files, outputs } = run(["--notes", "notas.md"], git);

    expect(code).toBe(0);
    expect(git).toHaveBeenCalledWith(["log", "--format=%s", "v1.2.3..HEAD"]);
    expect(logs).toEqual(["Release v1.2.4 (antes v1.2.3): 2 cambios."]);
    expect(files["notas.md"]).toContain("https://github.com/dueño/repo/compare/v1.2.3...v1.2.4");
    expect(outputs).toEqual(["salida.txt:release=true\n", "salida.txt:version=1.2.4\n", "salida.txt:tag=v1.2.4\n"]);
  });

  it("sin cambios desde la última release no crea otra", () => {
    const git = fakeGit({ tag: "v1.2.3", log: "  \n" });
    const { code, logs, files, outputs } = run(["--notes", "notas.md"], git);

    expect(code).toBe(0);
    expect(logs).toEqual(["Sin cambios desde v1.2.3: no se crea una release."]);
    expect(files).toEqual({});
    expect(outputs).toEqual(["salida.txt:release=false\n"]);
  });

  it("un describe vacío cuenta como si no hubiera tags", () => {
    const git = fakeGit({ tag: "", log: "feat: algo" });
    const { logs } = run(["--notes", "notas.md"], git);
    expect(git).toHaveBeenCalledWith(["log", "--format=%s", "HEAD"]);
    expect(logs).toEqual(["Release v1.0.0: 1 cambios."]);
  });

  it("fuera del CI (sin GITHUB_OUTPUT) solo escribe las notas", () => {
    const git = fakeGit({ tag: null, log: "feat: algo" });
    const { code, files, outputs } = run(["--notes", "notas.md"], git, { outputFile: undefined });
    expect(code).toBe(0);
    expect(Object.keys(files)).toEqual(["notas.md"]);
    expect(outputs).toEqual([]);
  });

  it("por defecto toma el repositorio y la salida de las variables del CI", () => {
    vi.stubEnv("GITHUB_OUTPUT", "");
    vi.stubEnv("GITHUB_REPOSITORY", "otro/repo");
    const git = fakeGit({ tag: "v1.0.0", log: "fix: x" });
    const files: Record<string, string> = {};
    const append = vi.fn();
    runCli(["--notes", "notas.md"], {
      git,
      writeFile: (file: string, text: string) => {
        files[file] = text;
      },
      append,
      log: () => {},
    });
    expect(files["notas.md"]).toContain("https://github.com/otro/repo/compare/v1.0.0...v1.0.1");
    expect(append).not.toHaveBeenCalled();
  });
});
