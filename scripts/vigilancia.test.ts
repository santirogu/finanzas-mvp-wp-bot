import { describe, expect, it, vi } from "vitest";
import { checkProduction, githubApi, ISSUE_LABEL, ISSUE_TITLE, syncIssue, WATCH_PATH } from "./vigilancia.mjs";

// La vigilancia cada hora (scripts/vigilancia.mjs): sin red, con fetch y GitHub simulados.

const URL_ = "https://app.test";

describe("checkProduction", () => {
  const respond = (status: number, body?: unknown) => vi.fn(async () => new Response(body === undefined ? "" : JSON.stringify(body), { status }));

  it("llama a la ruta con el secreto y lee ok", async () => {
    const fetch = respond(200, { ok: true, problems: [] });
    expect(await checkProduction({ url: URL_, secret: "s3", fetch })).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL_}${WATCH_PATH}`);
    expect(init.headers).toEqual({ Authorization: "Bearer s3" });
  });

  it("con problemas, con error del servidor, sin JSON o sin respuesta (la app caída): no está en orden", async () => {
    expect(await checkProduction({ url: URL_, secret: "s", fetch: respond(200, { ok: false, problems: ["claude"] }) })).toBe(false);
    expect(await checkProduction({ url: URL_, secret: "s", fetch: respond(503) })).toBe(false);
    expect(await checkProduction({ url: URL_, secret: "s", fetch: vi.fn(async () => new Response("<html>", { status: 200 })) })).toBe(false);
    expect(await checkProduction({ url: URL_, secret: "s", fetch: vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) })).toBe(false);
  });

  it("si la vigilancia está mal configurada (otro secreto o sin la ruta), lanza: no es un problema de producción", async () => {
    await expect(checkProduction({ url: URL_, secret: "s", fetch: respond(401) })).rejects.toThrow(/CRON_SECRET/);
    await expect(checkProduction({ url: URL_, secret: "s", fetch: respond(404) })).rejects.toThrow(/desplegada/);
  });
});

/** GitHub simulado: los issues abiertos con la etiqueta y lo que se hizo. */
function fakeIssues(open: { number: number }[] = []) {
  return {
    ensureLabel: vi.fn(async () => {}),
    openIssues: vi.fn(async () => open),
    create: vi.fn<(body: string) => Promise<object>>(async () => ({})),
    comment: vi.fn<(number: number, body: string) => Promise<object>>(async () => ({})),
    close: vi.fn<(number: number) => Promise<object>>(async () => ({})),
  };
}
const NOW = new Date("2026-10-22T02:41:00Z");

describe("syncIssue", () => {
  it("algo falla y no hay issue: abre uno sin decir qué falla, con la etiqueta", async () => {
    const issues = fakeIssues();
    expect(await syncIssue({ ok: false, issues, now: NOW })).toBe("opened");
    expect(issues.ensureLabel).toHaveBeenCalledOnce();
    const body = issues.create.mock.calls[0][0];
    expect(body).toContain("(21 de oct. de 2026, 9:41 p. m.)");
    expect(body).toContain("**Salud del sistema** y **Bot de WhatsApp**");
    expect(body).not.toMatch(/token|whatsapp_|claude|401/i);
  });

  it("el problema sigue: no hace nada (un aviso por problema, no uno por hora)", async () => {
    const issues = fakeIssues([{ number: 7 }]);
    expect(await syncIssue({ ok: false, issues, now: NOW })).toBe("unchanged");
    expect(issues.create).not.toHaveBeenCalled();
    expect(issues.comment).not.toHaveBeenCalled();
  });

  it("todo en orden con un issue abierto: lo cierra con un comentario", async () => {
    const issues = fakeIssues([{ number: 7 }]);
    expect(await syncIssue({ ok: true, issues, now: NOW })).toBe("closed");
    expect(issues.comment).toHaveBeenCalledWith(7, expect.stringMatching(/^Se resolvió: la revisión del .+ vio todo en orden\.$/));
    expect(issues.close).toHaveBeenCalledWith(7);
  });

  it("todo en orden y sin issue: nada", async () => {
    const issues = fakeIssues();
    expect(await syncIssue({ ok: true, issues, now: NOW })).toBe("unchanged");
    expect(issues.openIssues).toHaveBeenCalledOnce();
  });
});

describe("githubApi · productionUrl", () => {
  /** GitHub simulado: los despliegues a producción, del más nuevo al más viejo, con el estado de cada uno. */
  const deployments = (statuses: Record<number, { state: string; environment_url?: string } | undefined>) =>
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/deployments?")) return Response.json(Object.keys(statuses).reverse().map((id) => ({ id: Number(id) })));
      const id = Number(url.match(/\/deployments\/(\d+)\/statuses/)![1]);
      return Response.json(statuses[id] ? [statuses[id]] : []);
    });

  it("la URL del último despliegue exitoso al entorno production (sin la barra final)", async () => {
    const fetch = deployments({ 1: { state: "success", environment_url: "https://vieja.test" }, 2: { state: "success", environment_url: "https://anotado.test/" }, 3: { state: "failure" } });
    expect(await githubApi({ token: "t", repository: "r/r", fetch }).productionUrl()).toBe("https://anotado.test");
    expect(String(fetch.mock.calls[0][0])).toBe("https://api.github.com/repos/r/r/deployments?environment=production&per_page=30");
  });

  it("sin un despliegue exitoso con URL https, un error claro", async () => {
    const fetch = deployments({ 1: { state: "success", environment_url: "http://inseguro.test" }, 2: { state: "error" }, 3: undefined });
    await expect(githubApi({ token: "t", repository: "r/r", fetch }).productionUrl()).rejects.toThrow("No encontré un despliegue exitoso a producción");
  });
});

describe("githubApi · issues", () => {
  it("usa la API del repositorio con el token; crea la etiqueta solo si falta", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith(`/labels/${ISSUE_LABEL}`)) return new Response("", { status: 404 });
      return new Response(JSON.stringify(url.includes("/issues?") ? [] : {}), { status: 200 });
    });
    const issues = githubApi({ token: "ghs_x", repository: "dueño/repo", fetch });

    await issues.ensureLabel();
    await issues.openIssues();
    await issues.create("cuerpo");
    expect(calls.map((c) => `${c.init.method ?? "GET"} ${c.url}`)).toEqual([
      `GET https://api.github.com/repos/dueño/repo/labels/${ISSUE_LABEL}`,
      "POST https://api.github.com/repos/dueño/repo/labels",
      `GET https://api.github.com/repos/dueño/repo/issues?state=open&labels=${ISSUE_LABEL}&per_page=10`,
      "POST https://api.github.com/repos/dueño/repo/issues",
    ]);
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer ghs_x" });
    expect(JSON.parse(String(calls[3].init.body))).toEqual({ title: ISSUE_TITLE, body: "cuerpo", labels: [ISSUE_LABEL] });
  });

  it("con la etiqueta creada no la vuelve a crear; un error de GitHub lanza", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    await githubApi({ token: "t", repository: "r/r", fetch }).ensureLabel();
    expect(fetch).toHaveBeenCalledOnce();
    const failing = vi.fn(async () => new Response("{}", { status: 403 }));
    await expect(githubApi({ token: "t", repository: "r/r", fetch: failing }).close(7)).rejects.toThrow("GitHub respondió 403 a PATCH /issues/7");
  });
});
