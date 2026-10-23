import { asc } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, appValues } from "@/db/schema";
import { requestLocale } from "../../../../../../test/integration/locale";
import { createAdminWithTwoFactor } from "../../../../../../test/integration/two-factor";

// Los valores de la app desde /admin/configuracion: la Server Action con la capa de datos y la base de verdad, y
// los códigos como Google Authenticator. Se simulan la sesión y refresh().
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

const { changeAppValuesAction } = await import("./actions");
const { getAppValuesSettings } = await import("@/modules/admin/configuracion/values");
const { getAppValues } = await import("@/modules/app-values/current");

// Cada código sirve una vez y nunca uno anterior: cada acción usa el de los siguientes 30 s.
let step = 0;
async function seed() {
  const { admin, codeAt } = await createAdminWithTwoFactor();
  mocks.requireAdmin.mockReset().mockResolvedValue({ id: admin.id, role: "admin", twoFactorEnabled: true });
  mocks.refresh.mockReset();
  step = 0;
  return { admin, code: () => codeAt(new Date(Date.now() + 30_000 * step++)) };
}

/** El formulario con los valores de siempre, y lo que se cambie. */
const form = (fields: Record<string, string | null> = {}) => {
  const data = new FormData();
  const all: Record<string, string | null> = {
    upcomingEnabled: "on",
    upcomingDays: "3",
    budgetNearShare: "80",
    recurringMinMonths: "3",
    recurringWindow: "4",
    ...fields,
  };
  for (const [key, value] of Object.entries(all)) if (value !== null) data.set(key, value);
  return data;
};
const events = () =>
  db
    .select({ type: accountEvent.type, userId: accountEvent.userId, adminId: accountEvent.adminId, details: accountEvent.details })
    .from(accountEvent)
    .orderBy(asc(accountEvent.createdAt));

describe("cambiar los valores de la app", () => {
  it("sin cambios: los de siempre y sin último cambio", async () => {
    await seed();
    expect(await getAppValuesSettings()).toEqual({
      values: { upcomingEnabled: true, upcomingDays: 3, budgetNearShare: 80, recurringMinMonths: 3, recurringWindow: 4 },
      updated: null,
    });
  });

  it("con el código los guarda y el historial guarda los nuevos y los de antes (sin cuenta)", async () => {
    const { admin, code } = await seed();
    const result = await changeAppValuesAction(
      {},
      form({ upcomingEnabled: null, upcomingDays: "5", budgetNearShare: "70", recurringMinMonths: "2", recurringWindow: "3", code: code() }),
    );
    expect(result).toEqual({ message: "Se guardaron los valores de la app." });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    const values = { upcomingEnabled: false, upcomingDays: 5, budgetNearShare: 70, recurringMinMonths: 2, recurringWindow: 3 };
    expect(await getAppValues()).toEqual(values);
    const view = await getAppValuesSettings();
    expect(view).toMatchObject({ values, updated: { by: "Ana Admin" } });
    expect(view.updated!.at).toBeInstanceOf(Date);
    expect(await events()).toEqual([
      {
        type: "app_values_changed",
        userId: null,
        adminId: admin.id,
        details: { appValues: values, previousAppValues: { upcomingEnabled: true, upcomingDays: 3, budgetNearShare: 80, recurringMinMonths: 3, recurringWindow: 4 } },
      },
    ]);
    expect(await db.select({ id: appValues.id }).from(appValues)).toEqual([{ id: 1 }]);

    // Cambiarlos otra vez guarda los de antes del segundo cambio.
    await changeAppValuesAction({}, form({ budgetNearShare: "90", code: code() }));
    expect((await events())[1].details).toMatchObject({ previousAppValues: values, appValues: { budgetNearShare: 90 } });
  });

  it("lo que no sirve lo dice en su campo, y si no cambia nada, también; sin gastar el código", async () => {
    const { code } = await seed();
    const unused = code();
    expect(await changeAppValuesAction({}, form({ upcomingDays: "11", code: unused }))).toEqual({
      error: "Escribe un número de días de 0 a 10.",
      field: "upcomingDays",
    });
    expect(await changeAppValuesAction({}, form({ budgetNearShare: "40", code: unused }))).toEqual({
      error: "Escribe un porcentaje de 50 a 95.",
      field: "budgetNearShare",
    });
    expect(await changeAppValuesAction({}, form({ recurringWindow: "8", code: unused }))).toEqual({
      error: "Escribe de 3 a 6 meses.",
      field: "recurringWindow",
    });
    expect(await changeAppValuesAction({}, form({ recurringMinMonths: "5", code: unused }))).toEqual({
      error: "Escribe de 2 meses hasta los que se miran.",
      field: "recurringMinMonths",
    });
    expect(await changeAppValuesAction({}, form({ code: unused }))).toEqual({ error: "Los valores ya son esos: cambia alguno." });
    expect(await changeAppValuesAction({}, form({ budgetNearShare: "75", code: "000000" }))).toMatchObject({ field: "code" });
    expect(await events()).toEqual([]);
    expect(await getAppValues()).toMatchObject({ budgetNearShare: 80 });
    // El código que no se gastó sigue sirviendo.
    expect(await changeAppValuesAction({}, form({ budgetNearShare: "75", code: unused }))).toHaveProperty("message");
  });

  it("en inglés", async () => {
    const { code } = await seed();
    requestLocale.value = "en";
    expect(await changeAppValuesAction({}, form({ budgetNearShare: "99", code: "000000" }))).toEqual({
      error: "Enter a percentage from 50 to 95.",
      field: "budgetNearShare",
    });
    expect(await changeAppValuesAction({}, form({ code: "000000" }))).toEqual({ error: "The values are already those: change one." });
    expect(await changeAppValuesAction({}, form({ upcomingDays: "0", code: code() }))).toEqual({ message: "The app values were saved." });
  });

  it("sin rol de admin, se detiene en requireAdmin", async () => {
    mocks.requireAdmin.mockReset().mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(changeAppValuesAction({}, form({ budgetNearShare: "70", code: "123456" }))).rejects.toThrow();
    await expect(getAppValuesSettings()).rejects.toThrow();
    expect(await db.select().from(appValues)).toEqual([]);
  });
});
