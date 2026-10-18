import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { addTransaction, closeToasts, openTab, register, test, toast, visible } from "./helpers";

// El buscador de la lista del mes (src/components/searchable-transaction-list.tsx): aparece desde 6
// movimientos y filtra en el navegador por descripción y categoría.
const search = (page: Page) => visible(page.getByRole("searchbox", { name: "Buscar egresos" }));
const list = (page: Page) => visible(page.getByRole("main").getByRole("list"));
// El título de la lista ("6 movimientos este mes"; el del formulario es "Nuevo egreso").
const heading = (page: Page) => visible(page.getByRole("main").getByRole("heading", { level: 2, name: /movimientos? / }));

const EGRESOS = [
  { amount: "4900000", description: "Arriendo Civita", category: "Vivienda" },
  { amount: "82150", description: "Claro Postpago", category: "Servicios" },
  { amount: "74900", description: "Claro Hogar Civita", category: "Servicios" },
  { amount: "685320,75", description: "Mercado del mes", category: "Mercado" },
  { amount: "62000", description: "Taxi al aeropuerto", category: "Transporte" },
];

async function seriousViolations(page: Page) {
  // Sin transiciones a medias (al cambiar de modo, los colores cambian con transition): un color que
  // todavía cambia daría un contraste falso. La barrita de los avisos (toast-timer) no cambia colores.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || (a as CSSAnimation).animationName === "toast-timer"),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary ?? ""}`).join(" | ")}`);
}

test("buscar en los egresos del mes: por descripción o categoría, con su suma, y borrar la búsqueda", async ({ page }) => {
  await register(page);
  await openTab(page, "Egresos");

  await test.step("con 5 movimientos todavía no hay buscador", async () => {
    for (const egreso of EGRESOS) {
      await addTransaction(page, egreso);
      await expect(list(page).getByRole("listitem").filter({ hasText: egreso.description })).toBeVisible();
    }
    await expect(heading(page)).toHaveText("5 movimientos este mes");
    await expect(page.getByRole("searchbox")).toHaveCount(0);
  });

  await test.step("con el sexto aparece", async () => {
    await addTransaction(page, { amount: "125749", description: "Claro Hogar Áki", category: "Servicios" });
    await expect(heading(page)).toHaveText("6 movimientos este mes");
    await expect(search(page)).toBeVisible();
    await closeToasts(page);
  });

  await test.step("por la descripción: cuántos de cuántos, cuánto suman y lo que coincide marcado", async () => {
    await search(page).fill("claro");
    await expect(list(page).getByRole("listitem")).toHaveCount(3);
    await expect(heading(page)).toHaveText("3 de 6 movimientos este mes");
    // 82.150 + 74.900 + 125.749
    await expect(visible(page.getByText("−$282.799,00", { exact: true }))).toBeVisible();
    await expect(list(page).locator("mark")).toHaveText(["Claro", "Claro", "Claro"]);
  });

  await test.step("sin problemas de accesibilidad, en claro y en oscuro (con lo marcado)", async () => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      expect(await seriousViolations(page), colorScheme).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: null });
  });

  await test.step("por la categoría, sin tildes ni mayúsculas", async () => {
    await search(page).fill("VIVIEN");
    await expect(list(page).getByRole("listitem")).toHaveCount(1);
    await expect(list(page)).toContainText("Arriendo Civita");
    await expect(list(page).locator("mark")).toHaveText("Vivien");
  });

  await test.step("la ✕ la borra", async () => {
    await visible(page.getByRole("button", { name: "Borrar la búsqueda" })).click();
    await expect(search(page)).toHaveValue("");
    await expect(search(page)).toBeFocused();
    await expect(list(page).getByRole("listitem")).toHaveCount(6);
    await expect(heading(page)).toHaveText("6 movimientos este mes");
  });

  await test.step("si nada coincide lo dice, y se puede borrar desde ahí", async () => {
    await search(page).fill("zzz");
    await expect(visible(page.getByText("Ningún egreso coincide con «zzz» este mes."))).toBeVisible();
    await expect(heading(page)).toHaveText("0 de 6 movimientos este mes");
    await visible(page.getByRole("button", { name: "Borrar la búsqueda" })).last().click();
    await expect(list(page).getByRole("listitem")).toHaveCount(6);
  });

  await test.step("al borrar un movimiento mientras se busca, la búsqueda sigue", async () => {
    await search(page).fill("civita");
    await expect(list(page).getByRole("listitem")).toHaveCount(2);
    await visible(page.getByRole("button", { name: "Eliminar Claro Hogar Civita" })).click();
    await expect(toast(page, "Se borró «Claro Hogar Civita»")).toBeVisible();
    await expect(heading(page)).toHaveText("1 de 5 movimientos este mes");
    await expect(search(page)).toHaveValue("civita");
  });
});
