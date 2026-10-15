import { expect } from "@playwright/test";
import { addTransaction, newPerson, openTab, register, test, visible } from "./helpers";

// Dos personas en dos navegadores distintos: lo que registra una nunca aparece para la otra.
test("los movimientos de un usuario no aparecen en la cuenta de otro", async ({ browser }) => {
  const ana = await newPerson(browser);
  await register(ana, "Ana");
  await openTab(ana, "Egresos");
  await addTransaction(ana, { amount: "750000", description: "Secreto de Ana", category: "Ropa" });
  await expect(visible(ana.getByText("✓ Egreso registrado"))).toBeVisible();

  const beto = await newPerson(browser);
  await register(beto, "Beto");

  await expect(visible(beto.getByText("Aún no tienes movimientos este mes."))).toBeVisible();
  await expect(visible(beto.getByText("Balance del mes")).locator("..")).toContainText("$0,00");
  await openTab(beto, "Egresos");
  await expect(visible(beto.getByText("No has registrado egresos este mes."))).toBeVisible();
  await expect(visible(beto.getByText("Secreto de Ana"))).toHaveCount(0);

  // Y Ana sigue viendo lo suyo.
  await ana.reload();
  await expect(visible(ana.getByText("Secreto de Ana"))).toBeVisible();
});
