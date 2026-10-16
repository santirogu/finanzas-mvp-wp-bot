import { randomInt } from "node:crypto";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { newAdmin, setUpTwoFactor } from "../../../../e2e/admin";
import { addTransaction, fakeIp, register, uniqueEmail, visible } from "../../../../e2e/helpers";
import { newPhone, nthReply, sendWhatsApp } from "../../../../e2e/whatsapp";

// Las cuentas de prueba del recorrido, creadas como lo haría una persona (desde la app, en la base
// de las E2E): una vacía, una con datos normales y WhatsApp vinculado, y un admin con los textos y
// montos más largos que acepta la app.

export type Persona = "vacia" | "datos" | "admin";
export type Sesion = Awaited<ReturnType<BrowserContext["storageState"]>>;

export type Datos = {
  sesiones: Partial<Record<Persona, Sesion>>;
  correos: Partial<Record<Persona, string>>;
  /** Ruta para editar un egreso de cada cuenta con movimientos. */
  editar: Partial<Record<"datos" | "admin", string>>;
  /** Ruta del detalle de la cuenta "datos" en la administración. */
  cuentaDatos?: string;
  /** La categoría de 40 caracteres que crea el admin. */
  categoriaLarga?: string;
};

type Movimiento = { amount: string; description: string; category?: string };

export const opcionesBase = (baseURL: string) => ({
  baseURL,
  locale: "es-CO",
  timezoneId: "America/Bogota",
  extraHTTPHeaders: { "x-forwarded-for": fakeIp() },
});

const INGRESOS: Movimiento[] = [
  { amount: "3678748,50", description: "Salario quincenal", category: "Salario" },
  { amount: "450000", description: "Venta de la bicicleta", category: "Ventas" },
];

const EGRESOS: Movimiento[] = [
  { amount: "1800000", description: "Arriendo del apartamento", category: "Vivienda" },
  { amount: "685320,75", description: "Mercado del mes", category: "Mercado" },
  { amount: "38000", description: "Almuerzo con el equipo", category: "Alimentación" },
  { amount: "44900", description: "Suscripción de Netflix", category: "Entretenimiento" },
  { amount: "512000", description: "Pago de la tarjeta de crédito", category: "Deudas" },
  { amount: "62000", description: "Taxi al aeropuerto", category: "Transporte" },
  { amount: "120000", description: "Consulta médica", category: "Salud" },
];

/** Registra los movimientos en la pestaña y espera cada uno (la lista cuenta los del mes). */
async function registrar(page: Page, ruta: "/ingresos" | "/egresos", movimientos: Movimiento[]) {
  await page.goto(ruta);
  for (const [i, movimiento] of movimientos.entries()) {
    await addTransaction(page, movimiento);
    const total = i + 1;
    await expect(
      visible(page.getByRole("heading", { name: `${total} ${total === 1 ? "movimiento" : "movimientos"} este mes` })),
    ).toBeVisible();
  }
}

/** La ruta de edición del primer movimiento de la lista. */
async function primeraEdicion(page: Page) {
  await page.goto("/egresos");
  const href = await visible(page.getByRole("link", { name: /^Editar / })).first().getAttribute("href");
  if (!href) throw new Error("No se encontró el enlace para editar un egreso");
  return href;
}

async function nuevaPagina(browser: Browser, baseURL: string) {
  const context = await browser.newContext(opcionesBase(baseURL));
  return context.newPage();
}

async function vacia(browser: Browser, baseURL: string, datos: Datos) {
  const page = await nuevaPagina(browser, baseURL);
  const { email } = await register(page, "Luisa Gómez");
  datos.correos.vacia = email;
  datos.sesiones.vacia = await page.context().storageState();
  await page.context().close();
}

async function conDatos(browser: Browser, baseURL: string, datos: Datos) {
  const page = await nuevaPagina(browser, baseURL);
  // Un nombre largo, como muchos en Colombia: pone a prueba el encabezado y los listados.
  const { email } = await register(page, "María Fernanda Rodríguez de las Casas", uniqueEmail());
  datos.correos.datos = email;
  await registrar(page, "/ingresos", INGRESOS);
  await registrar(page, "/egresos", EGRESOS);

  // WhatsApp vinculado y dos movimientos registrados por el bot (con el Claude falso de las E2E).
  await page.goto("/dashboard");
  await visible(page.getByRole("button", { name: "Conectar WhatsApp" })).click();
  const code = (await visible(page.getByText(/^VINCULAR \d{6}$/)).textContent())!;
  const phone = newPhone();
  await sendWhatsApp(page.request, phone, code);
  await nthReply(page.request, phone, 1);
  await sendWhatsApp(page.request, phone, "almuerzo de hoy");
  await nthReply(page.request, phone, 2);
  await sendWhatsApp(page.request, phone, "llegó la quincena");
  await nthReply(page.request, phone, 3);

  datos.editar.datos = await primeraEdicion(page);
  datos.sesiones.datos = await page.context().storageState();
  await page.context().close();
}

async function admin(browser: Browser, baseURL: string, datos: Datos) {
  const page = await nuevaPagina(browser, baseURL);
  datos.correos.admin = await newAdmin(page);
  await setUpTwoFactor(page);

  // Lo más largo que se puede escribir: categorías de 40 caracteres y descripciones de 140.
  const id = String(randomInt(100_000, 999_999));
  const categoria = `Suscripciones y servicios digitales ${id}`.slice(0, 40);
  datos.categoriaLarga = categoria;
  await page.goto("/admin/categorias");
  await visible(page.getByRole("button", { name: "Nueva categoría" })).click();
  await page.getByRole("dialog").getByLabel("Nombre").fill(categoria);
  await page.getByRole("dialog").getByRole("button", { name: "Crear" }).click();
  await expect(visible(page.getByRole("status"))).toContainText(categoria);

  const larga = `Pago de la cuota de administración del conjunto residencial ${id} `.repeat(3).slice(0, 140).trim();
  const maximo = "99999999999,99";
  await registrar(page, "/ingresos", [{ amount: maximo, description: larga }]);
  // Muchos movimientos: la lista larga y todas las categorías en el resumen.
  const muchos = Array.from({ length: 24 }, (_, i) => EGRESOS[i % EGRESOS.length]);
  await registrar(page, "/egresos", [{ amount: maximo, description: larga, category: categoria }, ...muchos]);
  datos.editar.admin = await primeraEdicion(page);

  if (datos.correos.datos) {
    await page.goto(`/admin/usuarios?q=${encodeURIComponent(datos.correos.datos)}`);
    const href = await visible(page.getByRole("list", { name: "Cuentas" })).getByRole("link").first().getAttribute("href");
    datos.cuentaDatos = href ?? undefined;
  }
  datos.sesiones.admin = await page.context().storageState();
  await page.context().close();
}

/** Crea las cuentas que necesitan las vistas del recorrido ("datos" antes que "admin": el admin la busca). */
export async function prepararDatos(browser: Browser, baseURL: string, personas: Set<Persona>): Promise<Datos> {
  const datos: Datos = { sesiones: {}, correos: {}, editar: {} };
  if (personas.has("vacia")) await vacia(browser, baseURL, datos);
  if (personas.has("datos")) await conDatos(browser, baseURL, datos);
  if (personas.has("admin")) await admin(browser, baseURL, datos);
  return datos;
}
