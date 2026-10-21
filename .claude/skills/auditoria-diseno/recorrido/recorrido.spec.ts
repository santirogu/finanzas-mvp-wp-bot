import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { visible } from "../../../../e2e/helpers";
import { opcionesBase, prepararDatos, type Datos } from "./datos";
import { DISPOSITIVOS, GRUPOS, type Dispositivo } from "./dispositivos";
import { instalarMedidorDeSaltos, medirDiseno, medirSaltos, revisarAxe, revisarFoco, type PasoDeFoco, type Problema } from "./medir";
import { personasNecesarias, vistasPedidas, type Vista } from "./vistas";

// El recorrido de la auditoría de diseño (SKILL.md): cada vista en cada dispositivo, con capturas y
// medidas. Un test por grupo de dispositivos (corren en paralelo, cada uno con sus cuentas) y por
// motor (los proyectos chromium y webkit). Al final, galeria.ts arma la galería y el resumen.
//
// Uso (desde la raíz del repo):
//   pnpm exec playwright test -c .claude/skills/auditoria-diseno/recorrido/playwright.config.ts
// Filtros: AUDITORIA_VISTAS=id1,id2 · AUDITORIA_GRUPOS=celular,tableta · --project chromium
// En inglés: AUDITORIA_IDIOMA=en (cada vista con la cookie `idioma=en`; las cuentas se crean igual, en
// español). Solo las vistas sin `preparar`: sus pasos tocan textos en español.

export type Resultado = {
  motor: string;
  vista: string;
  titulo: string;
  ruta: string;
  dispositivo: string;
  grupo: string;
  capturas: { claro?: string; oscuro?: string };
  problemas: Problema[];
  foco?: PasoDeFoco[];
  error?: string;
};

const SALIDA = path.resolve(process.env.AUDITORIA_SALIDA!);
const IDIOMA: "es" | "en" = process.env.AUDITORIA_IDIOMA === "en" ? "en" : "es";
const vistas = vistasPedidas().filter((vista) => IDIOMA === "es" || !vista.preparar);
const grupos = (process.env.AUDITORIA_GRUPOS ?? "").split(",").map((g) => g.trim()).filter(Boolean);

/** Espera a que la página termine de cargar y de animarse (las capturas y axe ven el estado final). */
async function esperarEstable(page: Page) {
  await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((listo) => requestAnimationFrame(() => requestAnimationFrame(listo))));
  await page
    // Sin esperar las que no terminan (el esqueleto de carga) ni la barrita del tiempo de un aviso
    // emergente (toast-timer): con ella, la captura saldría sin el aviso.
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (a) =>
              a.playState !== "running" ||
              a.effect?.getTiming().iterations === Infinity ||
              (a as CSSAnimation).animationName === "toast-timer",
          ),
      null,
      { timeout: 5_000 },
    )
    .catch(() => {});
}

async function capturar(page: Page, archivo: string) {
  mkdirSync(path.dirname(archivo), { recursive: true });
  await page.screenshot({ path: archivo, fullPage: true, type: "jpeg", quality: 70, scale: "css", animations: "disabled" });
  return path.relative(SALIDA, archivo);
}

async function recorrerVista(browser: Browser, baseURL: string, motor: string, vista: Vista, dispositivo: Dispositivo, datos: Datos): Promise<Resultado> {
  const ruta = vista.ruta(datos);
  const resultado: Resultado = { motor, vista: vista.id, titulo: vista.titulo, ruta: ruta ?? "", dispositivo: dispositivo.id, grupo: dispositivo.grupo, capturas: {}, problemas: [] };
  if (!ruta) return { ...resultado, error: "No se pudo armar la ruta (faltan los datos de la cuenta)" };

  const context = await browser.newContext({
    ...opcionesBase(baseURL),
    viewport: { width: dispositivo.ancho, height: dispositivo.alto },
    deviceScaleFactor: dispositivo.escala,
    // Firefox no emula celulares; Chromium y WebKit sí.
    isMobile: dispositivo.tactil,
    hasTouch: dispositivo.tactil,
    colorScheme: "light",
    storageState: vista.persona ? datos.sesiones[vista.persona] : undefined,
  });
  if (IDIOMA === "en") await context.addCookies([{ name: "idioma", value: "en", url: baseURL }]);
  await context.addInitScript(instalarMedidorDeSaltos);
  const page = await context.newPage();
  page.on("console", (mensaje) => {
    // Esperables: los 4xx de los formularios (un login equivocado, la página 404) y la analítica de
    // Vercel, que solo existe desplegada (/_vercel/insights).
    if (mensaje.type() !== "error" || /status of 4\d\d|\/_vercel\//.test(mensaje.text())) return;
    resultado.problemas.push({ tipo: "consola", nivel: "defecto", detalle: "Error en la consola del navegador", medida: mensaje.text().slice(0, 200) });
  });
  page.on("pageerror", (error) => {
    resultado.problemas.push({ tipo: "consola", nivel: "defecto", detalle: "Error de JavaScript en la página", medida: error.message.slice(0, 200) });
  });

  try {
    await page.goto(ruta);
    await esperarEstable(page);
    await vista.preparar?.(page, datos);
    await esperarEstable(page);

    resultado.problemas.push(...(await page.evaluate(medirDiseno, { tactil: dispositivo.tactil, idioma: IDIOMA })), ...(await medirSaltos(page)));
    const carpeta = path.join(SALIDA, "capturas", motor, vista.id);
    resultado.capturas.claro = await capturar(page, path.join(carpeta, `${dispositivo.id}-claro.jpg`));

    if (dispositivo.representativo) {
      resultado.problemas.push(...(await revisarAxe(page, "claro")));
      await page.emulateMedia({ colorScheme: "dark" });
      await esperarEstable(page);
      resultado.capturas.oscuro = await capturar(page, path.join(carpeta, `${dispositivo.id}-oscuro.jpg`));
      resultado.problemas.push(...(await revisarAxe(page, "oscuro")));
      // El teclado, al final: el recorrido con Tab deja el foco en algún elemento, y la captura oscura
      // tiene que mostrar lo mismo que la clara. Solo en el computador (en WebKit, Tab no pasa por los
      // enlaces si no se activa en Safari).
      if (dispositivo.grupo === "computador" && motor === "chromium") {
        const foco = await revisarFoco(page);
        resultado.foco = foco.orden;
        resultado.problemas.push(...foco.problemas);
      }
    }
  } catch (error) {
    resultado.error = error instanceof Error ? error.message.split("\n")[0] : String(error);
    await capturar(page, path.join(SALIDA, "capturas", motor, vista.id, `${dispositivo.id}-error.jpg`)).catch(() => {});
  } finally {
    await context.close();
  }
  return resultado;
}

for (const grupo of GRUPOS) {
  test(`recorrido: ${grupo}`, async ({ browser, baseURL }, testInfo) => {
    test.skip(grupos.length > 0 && !grupos.includes(grupo), "grupo no pedido");
    test.setTimeout(30 * 60_000);
    const motor = testInfo.project.name;
    const dispositivos = DISPOSITIVOS.filter((d) => d.grupo === grupo);
    const datos = await test.step("crear las cuentas de prueba", () => prepararDatos(browser, baseURL!, personasNecesarias(vistas)));

    const resultados: Resultado[] = [];
    const archivo = path.join(SALIDA, "medidas", `${motor}-${grupo}.json`);
    mkdirSync(path.dirname(archivo), { recursive: true });
    for (const vista of vistas) {
      for (const dispositivo of dispositivos) {
        resultados.push(await recorrerVista(browser, baseURL!, motor, vista, dispositivo, datos));
        // Se guarda en cada paso: si algo se corta, queda lo recorrido hasta ahí.
        writeFileSync(archivo, JSON.stringify(resultados, null, 2));
      }
    }
  });
}
