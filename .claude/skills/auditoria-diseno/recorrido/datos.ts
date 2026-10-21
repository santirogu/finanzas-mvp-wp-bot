import { randomInt } from "node:crypto";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { newAdmin, setUpTwoFactor } from "../../../../e2e/admin";
import { addTransaction, adminCommand, fakeIp, register, toast, uniqueEmail, visible } from "../../../../e2e/helpers";
import { newPhone, nthReply, sendWhatsApp } from "../../../../e2e/whatsapp";
import { monthOf, monthParam, shiftMonth, todayInTimezone } from "../../../../src/lib/dates";

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
  /** Ruta del detalle de otro admin (el admin del recorrido es el super admin: puede quitarle el rol). */
  cuentaOtroAdmin?: string;
  /** La categoría de 40 caracteres que crea el admin. */
  categoriaLarga?: string;
  /** Egresos con el aviso emergente "Se borró… · Deshacer" de un movimiento de la cuenta "datos" (la URL lo pide durante 10 minutos). */
  borrado?: string;
};

type Movimiento = { amount: string; description: string; category?: string; date?: string };

/** El `?mes=` del mes anterior (el Resumen lo compara con el actual y se puede navegar). */
export const MES_ANTERIOR = monthParam(shiftMonth(monthOf(todayInTimezone("America/Bogota")), -1));
/** Dos y tres meses atrás: con ellos, Reportes muestra gastos fijos y compara las categorías con su promedio. */
const HACE_DOS_MESES = monthParam(shiftMonth(monthOf(todayInTimezone("America/Bogota")), -2));
const HACE_TRES_MESES = monthParam(shiftMonth(monthOf(todayInTimezone("America/Bogota")), -3));
/** El día del mes dentro de `n` días (o antes, si es negativo), hasta el 28: está en todos los meses. */
const diaEn = (n: number) => {
  const fecha = new Date(`${todayInTimezone("America/Bogota")}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + n);
  return String(Math.min(fecha.getUTCDate(), 28)).padStart(2, "0");
};
// Los avisos de próximos pagos del Resumen: la suscripción de música toca en unos días y el gimnasio está
// atrasado (los dos, pagados los tres meses anteriores y no este). Sin "Servicios": la categoría larga del
// admin ("…servicios digitales…") también la contiene y el selector encontraría dos.
const DIA_MUSICA = diaEn(2);
const DIA_GIMNASIO = diaEn(-5);

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

// De meses anteriores: el Resumen compara cada total con el mes anterior, la tarjeta del año marca
// varios y Reportes tiene historia (gastos fijos y promedios).
const ANTERIORES: { ruta: "/ingresos" | "/egresos"; movimiento: Movimiento }[] = [
  { ruta: "/ingresos", movimiento: { amount: "3678748,50", description: "Salario quincenal", category: "Salario", date: `${MES_ANTERIOR}-15` } },
  { ruta: "/egresos", movimiento: { amount: "1800000", description: "Arriendo del apartamento", category: "Vivienda", date: `${MES_ANTERIOR}-05` } },
  { ruta: "/egresos", movimiento: { amount: "742100", description: "Mercado del mes", category: "Mercado", date: `${MES_ANTERIOR}-20` } },
  // El arriendo en los últimos cuatro meses y el mercado en tres: los dos son gastos fijos en Reportes.
  { ruta: "/egresos", movimiento: { amount: "1800000", description: "Arriendo del apartamento", category: "Vivienda", date: `${HACE_DOS_MESES}-05` } },
  { ruta: "/egresos", movimiento: { amount: "1800000", description: "Arriendo del apartamento", category: "Vivienda", date: `${HACE_TRES_MESES}-05` } },
  { ruta: "/egresos", movimiento: { amount: "698400", description: "Mercado del mes", category: "Mercado", date: `${HACE_DOS_MESES}-18` } },
  ...[MES_ANTERIOR, HACE_DOS_MESES, HACE_TRES_MESES].flatMap((mes) => [
    { ruta: "/egresos" as const, movimiento: { amount: "26900", description: "Suscripción de música", category: "Entretenimiento", date: `${mes}-${DIA_MUSICA}` } },
    { ruta: "/egresos" as const, movimiento: { amount: "120000", description: "Gimnasio", category: "Salud", date: `${mes}-${DIA_GIMNASIO}` } },
  ]),
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

/** Registra movimientos de otro mes: la lista de este mes no cambia, el aviso dice en qué mes quedaron. */
async function registrarAnteriores(page: Page, movimientos: typeof ANTERIORES) {
  for (const { ruta, movimiento } of movimientos) {
    await page.goto(ruta);
    await addTransaction(page, movimiento);
    await expect(toast(page, /^(Ingreso|Egreso) registrado en /)).toBeVisible();
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
  await registrarAnteriores(page, ANTERIORES);

  // WhatsApp vinculado (desde Mi cuenta) y dos movimientos registrados por el bot (con el Claude falso de las E2E).
  await page.goto("/cuenta");
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

  // Un movimiento borrado, para el aviso "Se borró… · Deshacer" (se puede deshacer 10 minutos).
  await page.goto("/egresos");
  await addTransaction(page, { amount: "9500", description: "Café para borrar", category: "Alimentación" });
  await expect(toast(page, /^Egreso registrado$/)).toBeVisible();
  // La dirección que pide el aviso: la app la limpia al mostrarlo, así que se arma con el id de la fila.
  const fila = visible(page.getByRole("main").getByRole("listitem").filter({ hasText: "Café para borrar" }));
  const id = await fila.locator('input[name="id"]').getAttribute("value");
  await visible(page.getByRole("button", { name: "Eliminar Café para borrar" })).click();
  await expect(toast(page, "Se borró “Café para borrar”")).toBeVisible();
  datos.borrado = `/egresos?borrado=${id}`;

  datos.sesiones.datos = await page.context().storageState();
  await page.context().close();
}

async function admin(browser: Browser, baseURL: string, datos: Datos) {
  const page = await nuevaPagina(browser, baseURL);
  datos.correos.admin = await newAdmin(page);
  await setUpTwoFactor(page);
  // El super admin (en dorado, y con "Hacer admin" y "Quitar admin" en Usuarios). Con los grupos en
  // paralelo, el admin de otro grupo se la quita: las vistas que la necesitan se la vuelven a poner
  // (comoSuperAdmin en vistas.ts).
  adminCommand("super", datos.correos.admin);
  await page.reload();

  // Lo más largo que se puede escribir: categorías de 40 caracteres y descripciones de 140.
  const id = String(randomInt(100_000, 999_999));
  const categoria = `Suscripciones y servicios digitales ${id}`.slice(0, 40);
  datos.categoriaLarga = categoria;
  await page.goto("/admin/categorias");
  await visible(page.getByRole("button", { name: "Nueva categoría" })).click();
  await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill(categoria);
  await page.getByRole("dialog").getByRole("button", { name: "Crear" }).click();
  await expect(toast(page, categoria)).toBeVisible();

  const larga = `Pago de la cuota de administración del conjunto residencial ${id} `.repeat(3).slice(0, 140).trim();
  const maximo = "99999999999,99";
  await registrar(page, "/ingresos", [{ amount: maximo, description: larga }]);
  // Muchos movimientos: la lista larga y todas las categorías en el resumen.
  const muchos = Array.from({ length: 24 }, (_, i) => EGRESOS[i % EGRESOS.length]);
  await registrar(page, "/egresos", [{ amount: maximo, description: larga, category: categoria }, ...muchos]);
  // Un egreso máximo el mes anterior: la comparación del balance es la más larga posible.
  await registrarAnteriores(page, [
    { ruta: "/egresos", movimiento: { amount: maximo, description: larga, category: categoria, date: `${MES_ANTERIOR}-28` } },
  ]);
  datos.editar.admin = await primeraEdicion(page);

  if (datos.correos.datos) {
    await page.goto(`/admin/usuarios?q=${encodeURIComponent(datos.correos.datos)}`);
    const href = await visible(page.getByRole("list", { name: "Cuentas" })).getByRole("link").first().getAttribute("href");
    datos.cuentaDatos = href ?? undefined;
  }
  // Otro admin, para ver su ficha desde el super admin.
  const otro = await nuevaPagina(browser, baseURL);
  const otroCorreo = uniqueEmail();
  await register(otro, "Carla Admin", otroCorreo);
  adminCommand("grant", otroCorreo);
  await otro.context().close();
  await page.goto(`/admin/usuarios?q=${encodeURIComponent(otroCorreo)}`);
  datos.cuentaOtroAdmin =
    (await visible(page.getByRole("list", { name: "Cuentas" })).getByRole("link").first().getAttribute("href")) ?? undefined;
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
