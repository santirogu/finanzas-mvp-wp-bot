import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { transaction, user as userTable } from "@/db/schema";
import { currentMonthRange, monthParam, shiftMonth } from "@/lib/dates";
import { register, sessionOf, type Jar } from "../../../../../test/integration/auth-http";

// "Reporte (PDF)" de Reportes con Better Auth y sesiones de verdad: un PDF del período, como archivo y
// sin caché; sin sesión, al login. Lo que dice el PDF (solo lo propio) se prueba en
// src/modules/reports/pdf/data.int.test.ts.
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { GET } = await import("./route");

const as = (jar: Jar) => {
  request.cookie = jar.header();
};
const download = (query = "") => GET(new Request(`http://localhost:3000/reportes/pdf${query}`));
const userIdOf = async (jar: Jar) => (await sessionOf(jar))!.user.id;

const current = currentMonthRange("America/Bogota");

beforeEach(() => {
  request.cookie = "";
});

describe("GET /reportes/pdf", () => {
  it("sin sesión lleva al login", async () => {
    await expect(download()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("descarga el reporte de los últimos 12 meses como PDF, sin guardarse en caché", async () => {
    const ana = await register("ana@test.local");
    await db.insert(transaction).values({ userId: await userIdOf(ana), type: "expense", amount: 50000, description: "Mercado", occurredOn: `${monthParam(current)}-01` });
    as(ana);

    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const from = monthParam(shiftMonth(current, -11));
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="reporte-${from}-a-${monthParam(current)}.pdf"`);
    const pdf = Buffer.from(await response.arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 20_000);

  it("con ?periodo=, el de ese año (y uno inválido, los últimos 12 meses)", async () => {
    const ana = await register("ana@test.local");
    as(ana);
    const lastYear = current.year - 1;
    expect((await download(`?periodo=${lastYear}`)).headers.get("content-disposition")).toBe(`attachment; filename="reporte-${lastYear}.pdf"`);
    expect((await download("?periodo=2999")).headers.get("content-disposition")).toContain(`a-${monthParam(current)}.pdf`);
  }, 20_000);

  it("una cuenta suspendida no descarga nada (su sesión ya no vale)", async () => {
    const ana = await register("ana@test.local");
    await db.update(userTable).set({ suspendedAt: new Date() }).where(eq(userTable.id, await userIdOf(ana)));
    as(ana);
    await expect(download()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});
