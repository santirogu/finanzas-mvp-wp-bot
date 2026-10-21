import "server-only";
import { cacheLife } from "next/cache";
import { fetchReleases, type Release } from "@/lib/releases";
import { describeError } from "@/lib/safe-log";
import { requireAdmin } from "@/lib/session";

// Los despliegues recientes de /admin/salud: las releases de GitHub. Se guardan 10 minutos en la caché de
// Next, compartida por todas las visitas: sin token, GitHub deja 60 pedidos por hora. Si GitHub no responde,
// la página se muestra igual, con un enlace a las releases.

async function cachedReleases(): Promise<Release[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  return fetchReleases();
}

export async function recentReleases(): Promise<{ ok: true; releases: Release[] } | { ok: false }> {
  await requireAdmin();
  try {
    return { ok: true, releases: await cachedReleases() };
  } catch (error) {
    console.warn("[salud] no se pudieron consultar las releases de GitHub", describeError(error));
    return { ok: false };
  }
}
