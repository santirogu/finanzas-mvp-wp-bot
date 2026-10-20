import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Los crons de Vercel (vercel.json): si la entrada falta o apunta a una ruta que no existe, la limpieza
// diaria (src/modules/account/retention.ts, lo que promete /privacidad) nunca corre en producción y
// todo lo demás sigue en verde.

const root = path.join(__dirname, "../../../..");
const { crons = [] } = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
  crons?: { path: string; schedule: string }[];
};

describe("crons de vercel.json", () => {
  it("la limpieza diaria está programada una vez al día", () => {
    const cleanup = crons.find((cron) => cron.path === "/api/cron/limpieza");
    expect(cleanup, "falta el cron de /api/cron/limpieza en vercel.json").toBeDefined();
    // Minuto y hora fijos, todos los días (el plan Hobby de Vercel solo permite crons diarios).
    expect(cleanup!.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
  });

  it.each(crons.map((cron) => [cron.path]))("%s apunta a una ruta que existe y responde a GET", (route) => {
    const file = path.join(root, "src/app", route, "route.ts");
    expect(existsSync(file), `no existe ${path.relative(root, file)}`).toBe(true);
    expect(readFileSync(file, "utf8")).toMatch(/export (async )?function GET\b/);
  });
});
