import { z } from "zod";
import { CHECK_TIMEOUT_MS } from "./service-check";
import { serviceUrl } from "./service-url";

// Las releases de GitHub: cada despliegue a producción que salió bien publica una (job "release" del CI,
// con el commit desplegado como destino). /admin/salud las lista y, con el commit de la versión que
// corre (src/lib/build-info.ts), dice cuál es. El repositorio es público: se consulta sin token.

export const GITHUB_REPO = "santirogu/finanzas-mvp-wp-bot";
export const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`;
export const commitUrl = (sha: string) => `https://github.com/${GITHUB_REPO}/commit/${sha}`;

/** Cuántas releases se piden. */
export const RELEASES_SHOWN = 5;

export type Release = {
  tag: string;
  /** ISO 8601: así se puede guardar en la caché de Next tal cual. */
  publishedAt: string;
  /** El commit desplegado (40 caracteres). */
  commit: string;
  url: string;
  /** Los cambios de las notas, sin el formato de Markdown ("bot: usar la descripción del historial (#155)"). */
  changes: string[];
};

const RELEASE = z.object({
  tag_name: z.string(),
  published_at: z.string().nullable(),
  target_commitish: z.string(),
  html_url: z.string(),
  body: z.string().nullable(),
  draft: z.boolean(),
});

/** Los cambios de las notas de una release (scripts/release.mjs): sus líneas "- …", sin negritas. */
export function releaseChanges(body: string | null): string[] {
  return (body ?? "")
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).replaceAll("**", "").trim())
    .filter(Boolean);
}

/** Las releases publicadas (sin borradores), de la más nueva a la más vieja, como las da GitHub. */
export function parseReleases(json: unknown): Release[] {
  return z
    .array(RELEASE)
    .parse(json)
    .filter((r) => !r.draft && r.published_at)
    .map((r) => ({ tag: r.tag_name, publishedAt: r.published_at!, commit: r.target_commitish, url: r.html_url, changes: releaseChanges(r.body) }));
}

/** Pide las últimas releases a la API de GitHub. Falla si no responde a tiempo o responde con un error. */
export async function fetchReleases(fetchFn: typeof fetch = fetch): Promise<Release[]> {
  const base = serviceUrl("GITHUB_API_URL", "https://api.github.com");
  const response = await fetchFn(`${base}/repos/${GITHUB_REPO}/releases?per_page=${RELEASES_SHOWN}`, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "finanzas-mvp" },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);
  return parseReleases(await response.json());
}

/** La release de un commit (la versión que corre), o null si no tiene: todavía se publica, o es un build local. */
export const releaseOf = (releases: readonly Release[], commit: string | null) =>
  (commit && releases.find((r) => r.commit === commit)) || null;
