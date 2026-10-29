import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { transaction, user as userTable } from "@/db/schema";
import { currentMonthRange, monthParam, shiftMonth } from "@/lib/dates";
import { eq } from "drizzle-orm";
import { register, sessionOf, type Jar } from "../../../../../../test/integration/auth-http";
import { requestLocale } from "../../../../../../test/integration/locale";

// "Descargar movimientos" de Reportes con Better Auth y sesiones de verdad: solo los movimientos propios
// del período, como archivo, y sin sesión, al login.
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
const download = (query = "") => GET(new Request(`http://localhost:3000/reportes/exportar${query}`));
const userIdOf = async (jar: Jar) => (await sessionOf(jar))!.user.id;
const add = (userId: string, values: Partial<typeof transaction.$inferInsert>) =>
  db.insert(transaction).values({ userId, type: "expense", amount: 1000, description: "Movimiento", occurredOn: "2026-10-05", ...values });

const current = currentMonthRange("America/Bogota");
const previous = shiftMonth(current, -1);

beforeEach(() => {
  request.cookie = "";
});

describe("GET /reportes/exportar", () => {
  it("sin sesión lleva al login", async () => {
    await expect(download()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("descarga los movimientos propios de los últimos 12 meses, como archivo y sin guardarse en caché", async () => {
    const ana = await register("ana@test.local");
    const beto = await register("beto@test.local", "Beto");
    const anaId = await userIdOf(ana);
    await add(anaId, { description: "Arriendo", amount: 1800000, occurredOn: `${monthParam(previous)}-05` });
    await add(anaId, { description: "Salario", type: "income", amount: 4000000, occurredOn: `${monthParam(current)}-01`, source: "whatsapp" });
    await add(anaId, { description: "Borrado", occurredOn: `${monthParam(current)}-01`, deletedAt: new Date() });
    await add(anaId, { description: "Viejo", occurredOn: `${monthParam(shiftMonth(current, -12))}-01` });
    await add(await userIdOf(beto), { description: "Secreto de Beto", occurredOn: `${monthParam(current)}-01` });
    as(ana);

    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const from = monthParam(shiftMonth(current, -11));
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="movimientos-${from}-a-${monthParam(current)}.csv"`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    // Empieza con el BOM de UTF-8 (sin él, Excel lee mal las tildes). Al decodificar, se descarta.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes).split("\r\n");
    expect(lines).toEqual([
      "Fecha;Tipo;Descripción;Categoría;Monto;Origen",
      `${monthParam(previous)}-05;Egreso;Arriendo;Sin categoría;-1800000,00;Web`,
      `${monthParam(current)}-01;Ingreso;Salario;Sin categoría;4000000,00;WhatsApp`,
      "",
    ]);
  });

  it("con ?periodo=, los de ese año (y uno inválido, los últimos 12 meses)", async () => {
    const ana = await register("ana@test.local");
    const anaId = await userIdOf(ana);
    const lastYear = current.year - 1;
    await add(anaId, { description: "Del año pasado", occurredOn: `${lastYear}-03-10` });
    await add(anaId, { description: "De este mes", occurredOn: `${monthParam(current)}-01` });
    as(ana);

    const year = await download(`?periodo=${lastYear}`);
    expect(year.headers.get("content-disposition")).toBe(`attachment; filename="movimientos-${lastYear}.csv"`);
    const text = await year.text();
    expect(text).toContain("Del año pasado");
    expect(text).not.toContain("De este mes");

    const invalid = await download("?periodo=2999");
    expect(invalid.headers.get("content-disposition")).toContain(`a-${monthParam(current)}.csv`);
  });

  it("con ?periodo=3-meses o 1-mes, los de esos meses contando el actual", async () => {
    const ana = await register("ana@test.local");
    const anaId = await userIdOf(ana);
    await add(anaId, { description: "Hace tres meses", occurredOn: `${monthParam(shiftMonth(current, -3))}-28` });
    await add(anaId, { description: "Hace dos meses", occurredOn: `${monthParam(shiftMonth(current, -2))}-01` });
    await add(anaId, { description: "Del mes pasado", occurredOn: `${monthParam(previous)}-15` });
    await add(anaId, { description: "De este mes", occurredOn: `${monthParam(current)}-01` });
    as(ana);

    const three = await download("?periodo=3-meses");
    const from = monthParam(shiftMonth(current, -2));
    expect(three.headers.get("content-disposition")).toBe(`attachment; filename="movimientos-${from}-a-${monthParam(current)}.csv"`);
    const threeText = await three.text();
    expect(threeText).not.toContain("Hace tres meses");
    for (const description of ["Hace dos meses", "Del mes pasado", "De este mes"]) expect(threeText).toContain(description);

    const one = await download("?periodo=1-mes");
    expect(one.headers.get("content-disposition")).toBe(`attachment; filename="movimientos-${monthParam(current)}.csv"`);
    const oneText = await one.text();
    expect(oneText).toContain("De este mes");
    expect(oneText).not.toContain("Del mes pasado");
  });

  it("una cuenta suspendida no descarga nada (su sesión ya no vale)", async () => {
    const ana = await register("ana@test.local");
    await db.update(userTable).set({ suspendedAt: new Date() }).where(eq(userTable.id, await userIdOf(ana)));
    as(ana);
    await expect(download()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});

describe("GET /reportes/exportar · en inglés", () => {
  it("el archivo para el Excel en inglés: separado por comas, con el punto de los centavos y su nombre", async () => {
    const ana = await register("ana@test.local");
    await add(await userIdOf(ana), { description: "Rent, Oct", amount: 1800000.5, occurredOn: `${monthParam(current)}-05` });
    as(ana);
    requestLocale.value = "en";

    const response = await download();
    const from = monthParam(shiftMonth(current, -11));
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="transactions-${from}-to-${monthParam(current)}.csv"`);
    expect(new TextDecoder().decode(await response.arrayBuffer()).split("\r\n")).toEqual([
      "Date,Type,Description,Category,Amount,Source",
      `${monthParam(current)}-05,Expense,"Rent, Oct",No category,-1800000.50,Web`,
      "",
    ]);
  });
});
