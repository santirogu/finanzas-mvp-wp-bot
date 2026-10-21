import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { transaction } from "@/db/schema";
import { createUser } from "../../../../test/integration/factories";
import { reportPdfData } from "./data";

// El "Reporte (PDF)" con la base de verdad: solo los movimientos propios del período (sin los eliminados
// ni los de otra cuenta), con el nombre y la moneda de la persona.

// El 20 de octubre de 2026 al mediodía en Bogotá.
const now = new Date("2026-10-20T17:00:00Z");

const add = (userId: string, values: Partial<typeof transaction.$inferInsert>) =>
  db.insert(transaction).values({ userId, type: "expense", amount: 1000, description: "Movimiento", occurredOn: "2026-10-05", ...values });

const owner = (user: { id: string; name: string }) => ({ ...user, timezone: "America/Bogota", currency: "COP" });

describe("reportPdfData", () => {
  it("los últimos 12 meses de la persona, sin lo de otra cuenta ni lo eliminado", async () => {
    const ana = await createUser({ name: "Ana Pérez" });
    const beto = await createUser({ name: "Beto" });
    await add(ana.id, { type: "income", description: "Salario", amount: 4000000, occurredOn: "2026-09-01" });
    await add(ana.id, { description: "Lavadora", amount: 1150000, occurredOn: "2026-09-12" });
    await add(ana.id, { description: "Borrado", amount: 9000000, occurredOn: "2026-10-02", deletedAt: new Date() });
    await add(ana.id, { description: "De hace más de un año", amount: 7000000, occurredOn: "2025-10-30" });
    await add(beto.id, { description: "Secreto de Beto", amount: 5000000, occurredOn: "2026-10-03" });

    const { period, view } = await reportPdfData(owner(ana), null, now);
    expect(period.range).toBe("De noviembre de 2025 a octubre de 2026");
    expect(view).toMatchObject({ name: "Ana Pérez", generated: "Generado el 20 de octubre de 2026", currency: "Montos en pesos colombianos (COP)" });
    expect(view.stats.slice(0, 3).map((stat) => stat.value)).toEqual(["$4.000.000,00", "$1.150.000,00", "$2.850.000,00"]);
    expect(view.biggest.rows).toEqual([{ description: "Lavadora", detail: "12 de sept. · Sin categoría", amount: "−$1.150.000,00" }]);
    expect(JSON.stringify(view)).not.toMatch(/Secreto de Beto|Borrado|De hace más de un año|\$5\.000\.000|\$9\.000\.000/);
  });

  it("con ?periodo= un año, los meses de ese año", async () => {
    const ana = await createUser();
    await add(ana.id, { description: "Del año pasado", amount: 300000, occurredOn: "2025-03-10" });
    await add(ana.id, { description: "De este año", amount: 200000, occurredOn: "2026-02-10" });

    const { period, view } = await reportPdfData(owner(ana), "2025", now);
    expect(period.id).toBe("2025");
    expect(view.range).toBe("De enero a diciembre de 2025");
    expect(view.biggest.rows.map((row) => row.description)).toEqual(["Del año pasado"]);
    expect(view.months).toHaveLength(12);
  });
});

describe("reportPdfData · en inglés", () => {
  it("el período, las cifras y las categorías (también sin categoría) en inglés", async () => {
    const ana = await createUser({ name: "Ana Pérez" });
    await add(ana.id, { description: "Groceries", amount: 50000, occurredOn: "2026-10-01" });
    const { period, view } = await reportPdfData(owner(ana), null, now, "en");
    expect(period.label).toBe("Last 12 months");
    expect(view.range).toBe("November 2025 to October 2026");
    expect(view.labels.title).toBe("Your finances report");
    expect(view.categories.rows.map((row) => [row.name, row.amount])).toEqual([["No category", "$50,000.00"]]);
  });
});
