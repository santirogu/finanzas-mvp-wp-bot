import { describe, expect, it, vi } from "vitest";
import { CHECKS, SMOKE_USER_AGENT, runCheck, runSmoke } from "./smoke.mjs";

const BASE = "https://app.test";

type Reply = { status: number; body?: string; headers?: Record<string, string> };
type Call = { url: string; init: RequestInit };

/** fetch simulado: responde según la ruta (path + query) o lanza si la respuesta es un Error. */
function fakeFetch(routes: Record<string, Reply | Error | Array<Reply | Error>>) {
  const calls: Call[] = [];
  const counters: Record<string, number> = {};
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const key = `${url.pathname}${url.search}`;
    calls.push({ url: url.href, init });
    const route = routes[key];
    const options = Array.isArray(route) ? route : [route];
    const index = Math.min(counters[key] ?? 0, options.length - 1);
    counters[key] = (counters[key] ?? 0) + 1;
    const reply = options[index];
    if (reply === undefined) return new Response("no existe", { status: 404 });
    if (reply instanceof Error) throw reply;
    return new Response(reply.body ?? "", { status: reply.status, headers: reply.headers });
  });
  return { fetch, calls };
}

/** Cabeceras de seguridad de una app bien configurada. */
const SECURE_HEADERS = {
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
};

/** Respuestas de una app sana para todos los chequeos (varios pueden pedir la misma ruta). */
const HEALTHY: Record<string, Reply> = {};
for (const check of CHECKS) {
  const previous = HEALTHY[check.path];
  HEALTHY[check.path] = {
    status: check.status,
    body: [previous?.body, check.contains].filter(Boolean).join(" "),
    headers: SECURE_HEADERS,
  };
}

function run(routes: Record<string, Reply | Error | Array<Reply | Error>>, options = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  const { fetch, calls } = fakeFetch(routes);
  const sleep = vi.fn(async () => {});
  const code = runSmoke(BASE, {
    fetch,
    sleep,
    bypassSecret: undefined,
    log: (m: string) => logs.push(m),
    error: (m: string) => errors.push(m),
    ...options,
  });
  return code.then((exit) => ({ exit, logs: logs.join("\n"), errors: errors.join("\n"), calls, sleep }));
}

describe("CHECKS", () => {
  it("cubre las páginas públicas, la salud de la app y el webhook", () => {
    expect(CHECKS.map((c) => [c.method ?? "GET", c.path, c.status])).toEqual([
      ["GET", "/login", 200],
      ["GET", "/login", 200],
      ["GET", "/privacidad", 200],
      ["GET", "/eliminar-datos", 200],
      ["GET", "/api/health", 200],
      [
        "GET",
        "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=smoke-test-token-falso&hub.challenge=smoke",
        403,
      ],
      ["POST", "/api/whatsapp/webhook", 401],
    ]);
  });

  it("cada chequeo dice en el log qué revisa", () => {
    expect(CHECKS.map((c) => c.name)).toEqual([
      "La página de inicio de sesión carga",
      "Las cabeceras de seguridad están activas",
      "La política de privacidad es pública (la exige Meta)",
      "La página para eliminar datos es pública (la exige Meta)",
      "La base de datos responde, tiene todas las migraciones y no falta configuración",
      "El webhook de WhatsApp rechaza un token de verificación falso",
      "El webhook de WhatsApp rechaza mensajes con firma falsa",
    ]);
  });

  it("el webhook recibe una firma con el formato de Meta pero falsa", () => {
    const post = CHECKS.find((c) => c.method === "POST");
    expect(post?.headers).toEqual({
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
    });
    expect(post?.body).toBe("{}");
  });

  it("exige las cabeceras de seguridad en producción", () => {
    expect(CHECKS.find((c) => c.responseHeaders)?.responseHeaders).toEqual({
      "content-security-policy": "frame-ancestors 'none'",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "strict-transport-security": "max-age=",
    });
  });

  it("exige el contenido que demuestra que la página y la salud son reales", () => {
    expect(CHECKS.find((c) => c.path === "/login")?.contains).toBe("Entrar");
    expect(CHECKS.find((c) => c.path === "/api/health")?.contains).toBe('"status":"ok"');
  });
});

describe("runSmoke", () => {
  it("pasa si todos los chequeos responden lo esperado", async () => {
    const result = await run(HEALTHY);

    expect(result.exit).toBe(0);
    expect(result.errors).toBe("");
    expect(result.logs).toBe(
      [
        "Smoke tests contra https://app.test",
        ...CHECKS.map((c) => `  ✓ ${c.name}`),
        "\n✓ Los 7 chequeos pasaron.",
      ].join("\n"),
    );
    expect(result.sleep).not.toHaveBeenCalled();
  });

  it("falla y explica cada chequeo que no pasó", async () => {
    const result = await run({
      ...HEALTHY,
      "/api/health": { status: 503, body: '{"status":"error"}' },
      "/privacidad": { status: 307, headers: { location: "https://app.test/login" } },
    });

    expect(result.exit).toBe(1);
    expect(result.errors).toBe(
      [
        "  ✗ La política de privacidad es pública (la exige Meta): respondió 307 → https://app.test/login, se esperaba 200",
        "  ✗ La base de datos responde, tiene todas las migraciones y no falta configuración: respondió 503, se esperaba 200",
        "\n✗ 2 de 7 chequeos fallaron.",
      ].join("\n"),
    );
    expect(result.logs).toContain("  ✓ La página de inicio de sesión carga");
  });

  it("falla si la página responde 200 pero sin el contenido esperado", async () => {
    const result = await run({ ...HEALTHY, "/login": { status: 200, body: "<html>Error</html>" } });
    expect(result.exit).toBe(1);
    expect(result.errors).toContain('La página de inicio de sesión carga: la respuesta no contiene "Entrar"');
  });

  it("reintenta los fallos transitorios (p. ej. arranque en frío) antes de darlos por malos", async () => {
    const result = await run({
      ...HEALTHY,
      "/api/health": [new Error("fetch failed"), { status: 502 }, { status: 200, body: '{"status":"ok"}' }],
    });

    expect(result.exit).toBe(0);
    expect(result.calls.filter((c) => c.url === "https://app.test/api/health")).toHaveLength(3);
    expect(result.sleep).toHaveBeenCalledTimes(2);
    expect(result.sleep).toHaveBeenCalledWith(5_000);
  });

  it("después del último intento no espera de más y reporta el último error", async () => {
    const result = await run(
      { ...HEALTHY, "/login": new Error("getaddrinfo ENOTFOUND") },
      { attempts: 2, delayMs: 10 },
    );

    expect(result.exit).toBe(1);
    expect(result.errors).toContain("La página de inicio de sesión carga: no respondió (getaddrinfo ENOTFOUND)");
    // Dos chequeos piden /login (la página y sus cabeceras): 2 intentos cada uno.
    expect(result.calls.filter((c) => c.url === "https://app.test/login")).toHaveLength(4);
    expect(result.sleep).toHaveBeenCalledTimes(2);
    expect(result.sleep).toHaveBeenCalledWith(10);
  });

  it("por defecto espera de verdad entre reintentos", async () => {
    const { fetch, calls } = fakeFetch({ "/login": [{ status: 500 }, { status: 200, body: "Entrar" }] });
    const start = Date.now();
    const code = await runSmoke(BASE, {
      checks: [CHECKS[0]],
      fetch,
      delayMs: 50,
      log: () => {},
      error: () => {},
    });
    expect(code).toBe(0);
    expect(calls).toHaveLength(2);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it("con attempts menor a 1 igual hace un intento", async () => {
    const result = await run({ ...HEALTHY, "/login": { status: 500 } }, { attempts: 0 });
    expect(result.exit).toBe(1);
    // Un intento por cada uno de los dos chequeos de /login.
    expect(result.calls.filter((c) => c.url === "https://app.test/login")).toHaveLength(2);
    expect(result.sleep).not.toHaveBeenCalled();
  });

  it("si Vercel pide iniciar sesión, explica que falta la llave y no reintenta", async () => {
    const protectedReply = { status: 302, headers: { location: "https://vercel.com/sso-api?url=x" } };
    const routes = Object.fromEntries(CHECKS.map((c) => [c.path, protectedReply]));
    const result = await run(routes);

    expect(result.exit).toBe(1);
    expect(result.errors).toContain(
      "La página de inicio de sesión carga: la URL está protegida por Vercel: define VERCEL_AUTOMATION_BYPASS_SECRET",
    );
    expect(result.calls).toHaveLength(CHECKS.length); // un intento por chequeo
    expect(result.sleep).not.toHaveBeenCalled();
  });

  it("con una llave incorrecta lo dice", async () => {
    const result = await run(
      { ...HEALTHY, "/login": { status: 302, headers: { location: "https://vercel.com/login?next=x" } } },
      { bypassSecret: "llave-vieja" },
    );
    expect(result.errors).toContain("la URL está protegida por Vercel y VERCEL_AUTOMATION_BYPASS_SECRET no es válido");
  });

  it("manda la llave de Vercel en cada request si está definida", async () => {
    const result = await run(HEALTHY, { bypassSecret: "llave" });
    for (const call of result.calls) {
      expect((call.init.headers as Record<string, string>)["x-vercel-protection-bypass"]).toBe("llave");
    }
  });

  it("toma la llave de VERCEL_AUTOMATION_BYPASS_SECRET (sin espacios)", async () => {
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "  llave-del-ci\n");
    try {
      const { fetch, calls } = fakeFetch(HEALTHY);
      await runSmoke(BASE, { fetch, log: () => {}, error: () => {} });
      expect((calls[0].init.headers as Record<string, string>)["x-vercel-protection-bypass"]).toBe("llave-del-ci");

      vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "   ");
      const empty = fakeFetch(HEALTHY);
      await runSmoke(BASE, { fetch: empty.fetch, log: () => {}, error: () => {} });
      expect(empty.calls[0].init.headers).not.toHaveProperty("x-vercel-protection-bypass");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rechaza URLs inválidas o sin https (salvo localhost)", async () => {
    for (const url of [undefined, "", "no-es-una-url"]) {
      const errors: string[] = [];
      expect(await runSmoke(url, { error: (m: string) => errors.push(m) })).toBe(2);
      expect(errors[0]).toBe(
        `✗ URL inválida: ${JSON.stringify(url ?? "")}\n  Uso: node scripts/smoke.mjs https://<dominio>`,
      );
    }

    const errors: string[] = [];
    expect(await runSmoke("http://app.test", { error: (m: string) => errors.push(m) })).toBe(2);
    expect(errors).toEqual(["✗ Usa https (o localhost): http://app.test/"]);

    for (const local of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
      const { fetch } = fakeFetch(HEALTHY);
      const logs: string[] = [];
      expect(await runSmoke(local, { fetch, log: (m: string) => logs.push(m), error: () => {} })).toBe(0);
      expect(logs[0]).toBe(`Smoke tests contra ${new URL(local).origin}`);
    }
  });
});

describe("runCheck · cabeceras", () => {
  const headersCheck = CHECKS.find((c) => c.responseHeaders)!;

  it("pasa si cada cabecera incluye lo esperado", async () => {
    const { fetch } = fakeFetch({ "/login": { status: 200, headers: SECURE_HEADERS } });
    expect(await runCheck(BASE, headersCheck, { fetch })).toEqual({ ok: true });
  });

  it("falla si una cabecera falta o no tiene el valor esperado", async () => {
    const { fetch } = fakeFetch({
      "/login": [
        { status: 200, headers: { ...SECURE_HEADERS, "x-frame-options": "SAMEORIGIN" } },
        { status: 200, headers: { ...SECURE_HEADERS, "content-security-policy": "" } },
      ],
    });
    expect(await runCheck(BASE, headersCheck, { fetch })).toEqual({
      ok: false,
      detail: 'la cabecera x-frame-options es "SAMEORIGIN", debería incluir "DENY"',
      retry: true,
    });
    const { fetch: missing } = fakeFetch({ "/login": { status: 200, headers: {} } });
    expect(await runCheck(BASE, headersCheck, { fetch: missing })).toEqual({
      ok: false,
      detail: `la cabecera content-security-policy es null, debería incluir "frame-ancestors 'none'"`,
      retry: true,
    });
  });
});

describe("runCheck", () => {
  const post = CHECKS.find((c) => c.method === "POST")!;

  it("manda el método, las cabeceras y el cuerpo del chequeo, sin seguir redirecciones", async () => {
    const { fetch, calls } = fakeFetch({ [post.path]: { status: 401 } });
    expect(await runCheck(BASE, post, { fetch })).toEqual({ ok: true });

    expect(calls[0].url).toBe("https://app.test/api/whatsapp/webhook");
    expect(calls[0].init).toMatchObject({
      method: "POST",
      headers: { "user-agent": SMOKE_USER_AGENT, ...post.headers },
      body: "{}",
      redirect: "manual",
    });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("por defecto usa GET, se identifica como smoke test y no agrega la llave de Vercel", async () => {
    const { fetch, calls } = fakeFetch({ "/login": { status: 200, body: "Entrar" } });
    await runCheck(BASE, CHECKS[0], { fetch });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.headers).toEqual({ "user-agent": "finanzas-smoke-test" });
    expect(SMOKE_USER_AGENT).toBe("finanzas-smoke-test");
  });

  it("corta las respuestas lentas con un timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { fetch } = fakeFetch({ "/login": { status: 200, body: "Entrar" } });
    await runCheck(BASE, CHECKS[0], { fetch });
    await runCheck(BASE, CHECKS[0], { fetch, timeoutMs: 1_000 });
    expect(timeout.mock.calls).toEqual([[20_000], [1_000]]);
    timeout.mockRestore();
  });

  it("marca como reintentables los errores de red y los estados inesperados", async () => {
    const { fetch } = fakeFetch({ "/login": [new Error("boom"), { status: 500 }, { status: 200, body: "x" }] });
    expect(await runCheck(BASE, CHECKS[0], { fetch })).toEqual({ ok: false, detail: "no respondió (boom)", retry: true });
    expect(await runCheck(BASE, CHECKS[0], { fetch })).toEqual({
      ok: false,
      detail: "respondió 500, se esperaba 200",
      retry: true,
    });
    expect(await runCheck(BASE, CHECKS[0], { fetch })).toEqual({
      ok: false,
      detail: 'la respuesta no contiene "Entrar"',
      retry: true,
    });
  });

  it("reporta errores de red que no son Error (incluso undefined)", async () => {
    const fetch = vi.fn().mockRejectedValueOnce("sin red").mockRejectedValueOnce(undefined);
    expect(await runCheck(BASE, CHECKS[0], { fetch })).toEqual({
      ok: false,
      detail: "no respondió (sin red)",
      retry: true,
    });
    expect(await runCheck(BASE, CHECKS[0], { fetch })).toEqual({
      ok: false,
      detail: "no respondió (undefined)",
      retry: true,
    });
  });

  it("solo considera protección de Vercel una redirección a vercel.com", async () => {
    const { fetch } = fakeFetch({
      "/login": [
        { status: 302, headers: { location: "https://otro.test/?next=https://vercel.com/sso-api" } },
        { status: 302, headers: { location: "https://vercel.com/sso-api?x" } },
      ],
    });
    expect((await runCheck(BASE, CHECKS[0], { fetch })).detail).toBe(
      "respondió 302 → https://otro.test/?next=https://vercel.com/sso-api, se esperaba 200",
    );
    expect(await runCheck(BASE, CHECKS[0], { fetch })).toMatchObject({ ok: false, retry: false });
  });
});
