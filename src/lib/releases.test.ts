import { afterEach, describe, expect, it, vi } from "vitest";
import { commitUrl, fetchReleases, GITHUB_REPO, parseReleases, RELEASES_PAGE, RELEASES_SHOWN, releaseChanges, releaseOf, type Release } from "./releases";

// Como las devuelve la API de GitHub (solo los campos que se usan, y alguno de más).
const githubRelease = (tag: string, sha: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  name: tag,
  published_at: "2026-10-21T02:02:40Z",
  target_commitish: sha,
  html_url: `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
  body: "### ✨ Funcionalidades\n\n- **bot:** usar la descripción del historial al registrar (#155)\n\n**Cambios completos:** https://github.com/x/compare/v1.54.1...v1.55.0\n",
  draft: false,
  prerelease: false,
  ...extra,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("releaseChanges", () => {
  it("las líneas de cambios de las notas, sin negritas; los títulos y el enlace al final no", () => {
    const body = "### ✨ Funcionalidades\n\n- **bot:** usar el historial (#155)\n- **web:** salud del sistema (#157)\n\n### 🧰 Mantenimiento\n\n- agregar el skill (#156)\n\n**Cambios completos:** https://…";
    expect(releaseChanges(body)).toEqual(["bot: usar el historial (#155)", "web: salud del sistema (#157)", "agregar el skill (#156)"]);
  });

  it("sin notas, ninguno", () => {
    expect(releaseChanges(null)).toEqual([]);
    expect(releaseChanges("")).toEqual([]);
    expect(releaseChanges("- ")).toEqual([]);
  });
});

describe("parseReleases", () => {
  it("lo que se muestra de cada release, en el orden de GitHub", () => {
    expect(parseReleases([githubRelease("v1.55.0", "a".repeat(40)), githubRelease("v1.54.1", "b".repeat(40))])).toEqual([
      {
        tag: "v1.55.0",
        publishedAt: "2026-10-21T02:02:40Z",
        commit: "a".repeat(40),
        url: `https://github.com/${GITHUB_REPO}/releases/tag/v1.55.0`,
        changes: ["bot: usar la descripción del historial al registrar (#155)"],
      },
      expect.objectContaining({ tag: "v1.54.1" }),
    ]);
  });

  it("deja fuera los borradores y las que no se publicaron", () => {
    const releases = parseReleases([
      githubRelease("v2.0.0", "c", { draft: true, published_at: null }),
      githubRelease("v1.9.0", "d", { published_at: null }),
      githubRelease("v1.8.0", "e", { body: null }),
    ]);
    expect(releases).toEqual([expect.objectContaining({ tag: "v1.8.0", changes: [] })]);
  });

  it("falla si GitHub responde algo que no es una lista de releases", () => {
    expect(() => parseReleases({ message: "API rate limit exceeded" })).toThrow();
    expect(() => parseReleases([{ tag_name: "v1" }])).toThrow();
  });
});

describe("fetchReleases", () => {
  it("pide las últimas releases del repositorio a la API de GitHub, sin token", async () => {
    const fetchFn = vi.fn(async () => Response.json([githubRelease("v1.55.0", "a")]));
    expect(await fetchReleases(fetchFn)).toEqual([expect.objectContaining({ tag: "v1.55.0" })]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${RELEASES_SHOWN}`);
    expect(init.headers).toMatchObject({ Accept: "application/vnd.github+json" });
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("en las E2E, al servidor falso (solo si es local)", async () => {
    vi.stubEnv("GITHUB_API_URL", "http://localhost:3101/github/");
    const fetchFn = vi.fn(async () => Response.json([]));
    await fetchReleases(fetchFn);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe(`http://localhost:3101/github/repos/${GITHUB_REPO}/releases?per_page=${RELEASES_SHOWN}`);
  });

  it("falla si GitHub responde con un error (por ejemplo, el límite de pedidos)", async () => {
    const fetchFn = vi.fn(async () => Response.json({ message: "API rate limit exceeded" }, { status: 403 }));
    await expect(fetchReleases(fetchFn)).rejects.toThrow("GitHub respondió 403");
  });
});

describe("releaseOf", () => {
  const releases: Release[] = parseReleases([githubRelease("v1.55.0", "a".repeat(40)), githubRelease("v1.54.1", "b".repeat(40))]);

  it("la release del commit que corre", () => {
    expect(releaseOf(releases, "b".repeat(40))?.tag).toBe("v1.54.1");
  });

  it("ninguna si el commit no tiene (todavía se publica) o si es un build local", () => {
    expect(releaseOf(releases, "c".repeat(40))).toBeNull();
    expect(releaseOf(releases, null)).toBeNull();
    expect(releaseOf([], "a".repeat(40))).toBeNull();
  });
});

it("los enlaces a GitHub", () => {
  expect(RELEASES_PAGE).toBe("https://github.com/santirogu/finanzas-mvp-wp-bot/releases");
  expect(commitUrl("abc")).toBe("https://github.com/santirogu/finanzas-mvp-wp-bot/commit/abc");
});
