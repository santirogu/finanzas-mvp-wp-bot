import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { todayInTimezone } from "../src/lib/dates";
import { seriousViolations } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { addTransaction, newPerson, openTab, register, test, visible } from "./helpers";

// Al escribir la descripción de un movimiento nuevo, debajo del campo aparecen las que la persona ya
// usó en ese tipo (las de los últimos meses), y elegir una propone la categoría de la última vez.

const form = (page: Page) => visible(page.locator("form").filter({ has: page.getByRole("heading", { name: /^Nuevo/ }) }));
const description = (page: Page) => form(page).getByRole("combobox", { name: "Descripción" });
const suggestionList = (page: Page) => page.getByRole("listbox", { name: "Descripciones que ya usaste" });

test("la descripción sugiere lo que ya registró y propone su categoría @principal", async ({ page, browser }) => {
  await register(page);
  await openTab(page, "Egresos");
  await addTransaction(page, { amount: "85000", description: "Mercado del barrio", category: "Mercado" });
  await expect(visible(page.getByText("1 movimiento este mes"))).toBeVisible();
  await addTransaction(page, { amount: "12000", description: "Tinto" });
  // El aviso del primero puede seguir a la vista: se espera a que esté el segundo en la lista.
  await expect(visible(page.getByText("2 movimientos este mes"))).toBeVisible();

  await test.step("al escribir, las muestra con su categoría; al tocar una, la elige con su categoría", async () => {
    await description(page).fill("");
    await description(page).pressSequentially("merc");
    await expect(suggestionList(page).getByRole("option")).toHaveText([/Mercado del barrio\s*🛒 Mercado/]);
    expect(await seriousViolations(page)).toEqual([]);
    await suggestionList(page).getByRole("option", { name: /Mercado del barrio/ }).click();
    await expect(description(page)).toHaveValue("Mercado del barrio");
    await expect(form(page).getByLabel("Categoría").locator("option:checked")).toHaveText(/Mercado/);
    await expect(suggestionList(page)).toBeHidden();
  });

  await test.step("con el teclado: flecha abajo y Enter (sin registrar)", async () => {
    await description(page).fill("");
    await description(page).pressSequentially("tin");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(description(page)).toHaveValue("Tinto");
    await expect(suggestionList(page)).toBeHidden();
    // Enter eligió la sugerencia, no envió el formulario: siguen siendo dos.
    await expect(visible(page.getByText("2 movimientos este mes"))).toBeVisible();
  });

  await test.step("en Ingresos no sugiere los egresos", async () => {
    await openTab(page, "Ingresos");
    await form(page).getByLabel("Descripción").pressSequentially("merc");
    await expect(suggestionList(page)).toHaveCount(0);
  });

  await test.step("otra persona no ve lo que escribió Ana", async () => {
    const beto = await newPerson(browser);
    await register(beto, "Beto");
    await openTab(beto, "Egresos");
    await form(beto).getByLabel("Descripción").pressSequentially("merc");
    await expect(suggestionList(beto)).toHaveCount(0);
  });
});

// En Safari (iPhone, iPad) tocar una sugerencia no hacía nada: la lista cancelaba el pointerdown para que
// el campo no perdiera el foco, y Safari, a diferencia de Chromium, no manda el click de ese toque.
test("al tocar una sugerencia la elige con su categoría, y el teclado sigue en el campo @tactil @safari", async ({ page }) => {
  await register(page);
  await openTab(page, "Egresos");
  await addTransaction(page, { amount: "85000", description: "Mercado del barrio", category: "Mercado" });
  await expect(visible(page.getByText("1 movimiento este mes"))).toBeVisible();

  await description(page).tap();
  await description(page).pressSequentially("merc");
  await suggestionList(page).getByRole("option", { name: /Mercado del barrio/ }).tap();
  await expect(description(page)).toHaveValue("Mercado del barrio");
  await expect(form(page).getByLabel("Categoría").locator("option:checked")).toHaveText(/Mercado/);
  await expect(suggestionList(page)).toBeHidden();
  await expect(description(page)).toBeFocused();
});

test("una poco usada aparece aunque haya muchas que se repiten más, y a mitad de palabra no sugiere nada", async ({ page }) => {
  const { email } = await register(page);
  // Como la cuenta de la captura: más de 20 egresos que se repiten (créditos, gastos varios) y un
  // "Arriendo Civita" de una sola vez. Se cargan en la base de las E2E (por la app serían 51 registros).
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  const [{ id }] = await sql<{ id: string }[]>`select id from "user" where email = ${email}`;
  const today = todayInTimezone("America/Bogota");
  const descriptions = [
    ...["Crédito Hipotecario Villa Verde", "Gastos Varios", ...Array.from({ length: 23 }, (_, i) => `Cuota ${i + 1}`)].flatMap((d) => [d, d]),
    "Arriendo Civita",
  ];
  for (const description of descriptions) {
    await sql`insert into transaction (user_id, type, amount, description, occurred_on) values (${id}, 'expense', 1000, ${description}, ${today})`;
  }
  await sql.end();

  await openTab(page, "Egresos");
  await description(page).pressSequentially("Ari");
  // "ari" solo está a mitad de palabra (hipotecario, varios): no es lo que se busca.
  await expect(suggestionList(page)).toBeHidden();
  await description(page).fill("");
  await description(page).pressSequentially("Arri");
  await expect(suggestionList(page).getByRole("option")).toHaveText(["Arriendo Civita"]);
});
