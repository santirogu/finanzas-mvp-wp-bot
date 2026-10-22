#!/usr/bin/env node
// La vigilancia de producción, cada hora desde GitHub Actions (.github/workflows/vigilancia.yml): llama a
// /api/cron/vigilancia con el secreto CRON_SECRET y, si algo falla, abre un issue (GitHub le avisa al dueño
// por correo y en el celular). Cuando todo vuelve a estar en orden, lo cierra. Solo cambia algo al pasar de
// bien a mal o al revés: un problema que sigue no manda un aviso cada hora.
//
// El repositorio es público: el issue y el log no dicen qué falla, solo dónde mirarlo (Salud del sistema y
// Bot de WhatsApp, en la administración de la app).
//
// Uso: node scripts/vigilancia.mjs (con CRON_SECRET, GITHUB_TOKEN y GITHUB_REPOSITORY).

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const WATCH_PATH = "/api/cron/vigilancia";
export const ISSUE_LABEL = "vigilancia";
export const ISSUE_TITLE = "Vigilancia: algo falla en producción";

/** El dominio de producción, del único lugar donde está: PRODUCTION_URL en deploy.yml. */
export function productionUrl(deployYml) {
  const url = deployYml.match(/^\s*PRODUCTION_URL:\s*(https:\/\/\S+)\s*$/m)?.[1];
  if (!url) throw new Error("No encontré PRODUCTION_URL en .github/workflows/deploy.yml");
  return url.replace(/\/$/, "");
}

/**
 * ¿Está todo en orden? `false` si la app reporta problemas, responde con error o no responde (está caída).
 * Lanza si la vigilancia misma está mal configurada (el secreto no coincide o la ruta no existe): eso no es
 * un problema de producción, y el workflow queda en rojo para que se arregle.
 */
export async function checkProduction({ url, secret, fetch = globalThis.fetch }) {
  let response;
  try {
    response = await fetch(`${url}${WATCH_PATH}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return false;
  }
  if (response.status === 401) throw new Error("La app rechazó el secreto: el CRON_SECRET de GitHub no es el mismo que el de Vercel");
  if (response.status === 404) throw new Error(`La app no tiene ${WATCH_PATH}: ¿está desplegada la versión que la trae?`);
  if (!response.ok) return false;
  const body = await response.json().catch(() => null);
  return body?.ok === true;
}

/** Una fecha para leer, en hora de Colombia y como en la app: "21 de oct. de 2026, 9:41 p. m." (el mes con punto). */
export const formatDate = (date) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  })
    .formatToParts(date)
    .map((part) => (part.type === "month" && !part.value.endsWith(".") ? `${part.value}.` : part.value))
    .join("")
    // Espacios duros (algunas versiones de ICU los usan antes de "p. m.") → espacios normales.
    .replace(/[\u00a0\u202f]/g, " ");

const issueBody = (date) =>
  [
    `La revisión de cada hora encontró un problema en producción (${formatDate(date)}).`,
    "",
    "Revisa **Salud del sistema** y **Bot de WhatsApp** en la administración de la app: ahí está qué falla y qué hacer.",
    "",
    "Este issue se cierra solo cuando la revisión vuelva a ver todo en orden.",
  ].join("\n");

/** Un cliente mínimo de la API de GitHub para los issues de la vigilancia. */
export function githubIssues({ token, repository, fetch = globalThis.fetch }) {
  const request = (path, init = {}) =>
    fetch(`https://api.github.com/repos/${repository}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    });
  const call = async (path, init = {}) => {
    const response = await request(path, init);
    if (!response.ok) throw new Error(`GitHub respondió ${response.status} a ${init.method ?? "GET"} ${path}`);
    return response.json();
  };
  return {
    /** La etiqueta, si todavía no existe: sin ella no se encontraría el issue abierto y se abriría otro cada hora. */
    ensureLabel: async () => {
      if ((await request(`/labels/${ISSUE_LABEL}`)).status !== 404) return;
      await call("/labels", { method: "POST", body: JSON.stringify({ name: ISSUE_LABEL, color: "b91c1c", description: "Problema en producción (vigilancia cada hora)" }) });
    },
    openIssues: () => call(`/issues?state=open&labels=${ISSUE_LABEL}&per_page=10`),
    create: (body) => call("/issues", { method: "POST", body: JSON.stringify({ title: ISSUE_TITLE, body, labels: [ISSUE_LABEL] }) }),
    comment: (number, body) => call(`/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    close: (number) => call(`/issues/${number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) }),
  };
}

/** Abre el issue si algo falla y no hay uno abierto; lo cierra si todo volvió a estar en orden. */
export async function syncIssue({ ok, issues, now = new Date() }) {
  const open = await issues.openIssues();
  if (!ok && open.length === 0) {
    await issues.ensureLabel();
    await issues.create(issueBody(now));
    return "opened";
  }
  if (ok && open.length > 0) {
    for (const issue of open) {
      await issues.comment(issue.number, `Se resolvió: la revisión del ${formatDate(now)} vio todo en orden.`);
      await issues.close(issue.number);
    }
    return "closed";
  }
  return "unchanged";
}

async function main() {
  const { CRON_SECRET: secret, GITHUB_TOKEN: token, GITHUB_REPOSITORY: repository } = process.env;
  if (!secret) throw new Error("Falta el secreto CRON_SECRET en GitHub (el mismo valor que en Vercel)");
  if (!token || !repository) throw new Error("Faltan GITHUB_TOKEN o GITHUB_REPOSITORY");
  const url = productionUrl(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const ok = await checkProduction({ url, secret });
  const result = await syncIssue({ ok, issues: githubIssues({ token, repository }) });
  const messages = {
    opened: "Hay un problema en producción: se abrió un issue.",
    closed: "Todo en orden de nuevo: se cerró el issue.",
    unchanged: ok ? "Todo en orden." : "El problema sigue: el issue ya está abierto.",
  };
  console.log(messages[result]);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
