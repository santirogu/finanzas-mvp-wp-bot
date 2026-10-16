import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

// Las medidas automáticas de cada vista. Cada problema dice qué pasa (detalle, siempre igual para el
// mismo problema: así se agrupa entre dispositivos), en qué elemento y cuánto mide.

export type Nivel = "defecto" | "aviso" | "info";

export type Problema = {
  tipo: string;
  nivel: Nivel;
  detalle: string;
  elemento?: string;
  medida?: string;
  modo?: "claro" | "oscuro";
};

/**
 * Corre dentro de la página (todo lo que usa tiene que estar aquí adentro): lo que se sale de la
 * pantalla o queda tapado, textos cortados, campos y zonas táctiles chicas y la estructura de títulos.
 */
export function medirDiseno({ tactil }: { tactil: boolean }): Problema[] {
  const problemas: Problema[] = [];
  const ancho = document.documentElement.clientWidth;
  const alto = window.innerHeight;

  const describir = (el: Element) => {
    const etiqueta = el.tagName.toLowerCase();
    const nombre = el.getAttribute("aria-label") ?? el.getAttribute("name") ?? el.getAttribute("title");
    const texto = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
    const clases = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
    return `<${etiqueta}${nombre ? ` "${nombre}"` : ""}${clases ? ` class="${clases}"` : ""}>${texto && !nombre ? ` ${texto}` : ""}`;
  };
  const tamano = (r: DOMRect) => `${Math.round(r.width)}×${Math.round(r.height)} px`;
  // Visible y con tamaño: sin los ocultos ni los "solo para lectores de pantalla" (1 × 1 px).
  const seVe = (el: Element) => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  // Dentro de algo que recorta o se desplaza de lado (una barra de pestañas con scroll, por ejemplo).
  const dentroDeRecorte = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== "visible") return true;
    }
    return false;
  };
  const dialogoAbierto = document.querySelector("dialog[open]");
  const todos = [...document.body.querySelectorAll("*")].filter(seVe);

  // 1. Lo que se sale de la pantalla (a la derecha o a la izquierda).
  const paginaAncho = document.documentElement.scrollWidth;
  if (paginaAncho > ancho + 1) {
    problemas.push({ tipo: "desborde", nivel: "defecto", detalle: "La página es más ancha que la pantalla (hay scroll de lado)", medida: `${paginaAncho} px en ${ancho} px` });
  }
  const fuera = new Set(
    todos.filter((el) => {
      const r = el.getBoundingClientRect();
      return (r.right > ancho + 1 || r.left < -1) && getComputedStyle(el).position !== "fixed" && !dentroDeRecorte(el);
    }),
  );
  // Solo el origen de cada rama: el que se sale aunque su contenedor quepa.
  for (const el of [...fuera].filter((el) => !fuera.has(el.parentElement!)).slice(0, 8)) {
    const r = el.getBoundingClientRect();
    problemas.push({ tipo: "fuera-de-pantalla", nivel: "defecto", detalle: "Se sale de la pantalla", elemento: describir(el), medida: `de ${Math.round(r.left)} a ${Math.round(r.right)} px (pantalla: ${ancho} px)` });
  }

  const esCampo = (el: Element) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  // Texto escrito directamente en el elemento (no en sus hijos).
  const textoPropio = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());

  for (const el of todos) {
    const s = getComputedStyle(el);
    const conTexto = Boolean((el.textContent ?? "").trim()) && !esCampo(el);

    // El texto se sale de su caja (un monto largo que no cabe en su tarjeta): su caja cabe, pero el
    // texto no, así que no aparece en "fuera-de-pantalla" aunque ensanche la página.
    if (textoPropio(el) && !esCampo(el) && s.overflowX === "visible" && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
      problemas.push({ tipo: "texto-se-sale", nivel: "defecto", detalle: "El texto se sale de su caja", elemento: describir(el), medida: `${el.scrollWidth} px en ${el.clientWidth} px` });
    }

    // 2. Contenedores que se desplazan de lado (no es un error: el revisor decide si se nota que hay más).
    if ((s.overflowX === "auto" || s.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) {
      problemas.push({ tipo: "scroll-de-lado", nivel: "info", detalle: "Se desplaza de lado (hay contenido oculto a la derecha)", elemento: describir(el), medida: `oculta ${el.scrollWidth - el.clientWidth} px` });
    }

    // 3. Textos cortados: con "…" es intencional (info); sin "…", se pierde texto.
    if (conTexto && (s.overflowX === "hidden" || s.overflowX === "clip") && el.scrollWidth > el.clientWidth + 1) {
      if (s.textOverflow === "ellipsis") {
        problemas.push({ tipo: "recortado", nivel: "info", detalle: "Texto recortado con …", elemento: describir(el) });
      } else {
        problemas.push({ tipo: "texto-cortado", nivel: "defecto", detalle: "Texto cortado a la derecha, sin …", elemento: describir(el), medida: `${el.scrollWidth} px en ${el.clientWidth} px` });
      }
    }
    if (conTexto && (s.overflowY === "hidden" || s.overflowY === "clip") && s.webkitLineClamp === "none" && el.scrollHeight > el.clientHeight + 1) {
      problemas.push({ tipo: "texto-cortado", nivel: "defecto", detalle: "Texto cortado abajo", elemento: describir(el), medida: `${el.scrollHeight} px en ${el.clientHeight} px` });
    }
  }

  // 4b. Campos de una misma fila (Categoría y Fecha) con altos distintos: Safari en Mac dibuja el
  // <select> con su apariencia nativa, más bajo y sin borde, si no lleva appearance-none.
  const filas = new Map<string, HTMLElement[]>();
  for (const campo of document.querySelectorAll<HTMLElement>(
    "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), select",
  )) {
    if (!seVe(campo)) continue;
    const clave = `${campo.closest("form") ? [...document.forms].indexOf(campo.closest("form")!) : -1}|${Math.round(campo.getBoundingClientRect().top / 8)}`;
    filas.set(clave, [...(filas.get(clave) ?? []), campo]);
  }
  for (const campos of filas.values()) {
    const altos = campos.map((c) => Math.round(c.getBoundingClientRect().height));
    if (campos.length > 1 && Math.max(...altos) - Math.min(...altos) > 2) {
      problemas.push({ tipo: "campos-desparejos", nivel: "defecto", detalle: "Campos de la misma fila con altos distintos", elemento: campos.map(describir).join(" · "), medida: altos.map((a) => `${a} px`).join(" y ") });
    }
  }

  // 4. Campos con letra de menos de 16 px en una pantalla táctil: Safari del iPhone hace zoom al tocarlos.
  if (tactil) {
    const campos = document.querySelectorAll<HTMLElement>(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea",
    );
    for (const campo of campos) {
      if (!seVe(campo)) continue;
      const letra = parseFloat(getComputedStyle(campo).fontSize);
      if (letra < 16) problemas.push({ tipo: "campo-chico", nivel: "defecto", detalle: "Campo con letra de menos de 16 px (Safari del iPhone hace zoom al tocarlo)", elemento: describir(campo), medida: `${letra} px` });
    }
  }

  // 5. Zonas táctiles: mínimo 24 × 24 px (WCAG 2.5.8) o con espacio libre alrededor; en pantallas
  // táctiles, Apple recomienda 44 × 44 px.
  const interactivos = [
    ...document.querySelectorAll<HTMLElement>(
      "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [tabindex]:not([tabindex='-1'])",
    ),
  ]
    .filter(seVe)
    .filter((el) => !(dialogoAbierto && !dialogoAbierto.contains(el)))
    // Un enlace dentro de un párrafo es la excepción "en línea" de la WCAG.
    .filter((el) => !(getComputedStyle(el).display === "inline" && (el.parentElement?.textContent ?? "").trim().length > (el.textContent ?? "").trim().length));
  const zona = (el: HTMLElement) => {
    // Un checkbox o radio dentro de su etiqueta: cuenta la etiqueta entera.
    const etiqueta = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? el.closest("label") : null;
    return (etiqueta ?? el).getBoundingClientRect();
  };
  const zonas = interactivos.map((el) => ({ el, r: zona(el) }));
  const centro = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const distanciaARect = (p: { x: number; y: number }, r: DOMRect) =>
    Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
  for (const { el, r } of zonas) {
    const lado = Math.min(r.width, r.height);
    if (lado < 24) {
      // Excepción por espacio: un círculo de 24 px en su centro no toca otra zona.
      const c = centro(r);
      const choca = zonas.some((otra) => otra.el !== el && !otra.el.contains(el) && !el.contains(otra.el) && distanciaARect(c, otra.r) < 12);
      if (choca) problemas.push({ tipo: "tactil-chico", nivel: "defecto", detalle: "Zona táctil de menos de 24 px y pegada a otra (WCAG 2.5.8)", elemento: describir(el), medida: tamano(r) });
    } else if (tactil && lado < 44) {
      problemas.push({ tipo: "tactil-recomendado", nivel: "aviso", detalle: "Zona táctil de menos de 44 px (lo que recomienda Apple)", elemento: describir(el), medida: tamano(r) });
    }
  }

  // 6. Elementos tapados por otro (un encabezado fijo, una barra): se revisa toda la página, de a una pantalla.
  const tapados = new Map<Element, Element>();
  const inicioY = window.scrollY;
  const altoPagina = document.documentElement.scrollHeight;
  for (let y = 0; y < altoPagina; y += Math.max(alto * 0.8, 200)) {
    window.scrollTo(0, y);
    for (const el of interactivos) {
      if (tapados.has(el)) continue;
      const r = el.getBoundingClientRect();
      const { x, y: cy } = centro(r);
      if (x < 0 || x > ancho || cy < 0 || cy > alto) continue;
      const arriba = document.elementFromPoint(x, cy);
      if (arriba && arriba !== el && !el.contains(arriba) && !arriba.contains(el) && !arriba.closest("label")?.contains(el)) tapados.set(el, arriba);
    }
  }
  window.scrollTo(0, inicioY);
  for (const [el, arriba] of tapados) {
    problemas.push({ tipo: "tapado", nivel: "defecto", detalle: "Queda tapado por otro elemento", elemento: describir(el), medida: `lo tapa ${describir(arriba)}` });
  }

  // 7. Estructura: idioma, un solo h1, títulos sin saltos de nivel y la región principal.
  if (!document.documentElement.lang.startsWith("es")) {
    problemas.push({ tipo: "estructura", nivel: "defecto", detalle: "La página no declara el idioma español (lang)", medida: document.documentElement.lang || "sin lang" });
  }
  const titulos = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(seVe);
  const h1 = titulos.filter((t) => t.tagName === "H1").length;
  if (h1 !== 1) problemas.push({ tipo: "estructura", nivel: "aviso", detalle: h1 === 0 ? "Sin título principal (h1)" : "Más de un título principal (h1)", medida: `${h1} h1` });
  let anterior = 0;
  for (const t of titulos) {
    const nivel = Number(t.tagName[1]);
    if (anterior && nivel > anterior + 1) problemas.push({ tipo: "estructura", nivel: "aviso", detalle: "Salto de nivel en los títulos", elemento: describir(t), medida: `de h${anterior} a h${nivel}` });
    anterior = nivel;
  }
  if (!document.querySelector("main")) problemas.push({ tipo: "estructura", nivel: "aviso", detalle: "Sin región principal (<main>)" });

  return problemas;
}

/** Cuánto se movió la página mientras cargaba (CLS, solo Chromium). Se instala antes de abrirla. */
export function instalarMedidorDeSaltos() {
  const ventana = window as unknown as { __saltos: number };
  ventana.__saltos = 0;
  try {
    new PerformanceObserver((lista) => {
      for (const entrada of lista.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entrada.hadRecentInput) ventana.__saltos += entrada.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {
    // WebKit no mide los saltos.
  }
}

export async function medirSaltos(page: Page): Promise<Problema[]> {
  const saltos = await page.evaluate(() => (window as unknown as { __saltos?: number }).__saltos ?? 0);
  if (saltos <= 0.1) return [];
  return [{ tipo: "saltos", nivel: saltos > 0.25 ? "defecto" : "aviso", detalle: "La página se mueve mientras carga (CLS)", medida: saltos.toFixed(3) }];
}

/** axe con WCAG 2.2 A y AA (todas las severidades) y sus buenas prácticas, como sugerencias. */
export async function revisarAxe(page: Page, modo: "claro" | "oscuro"): Promise<Problema[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  return violations.flatMap((v) => {
    const buenaPractica = !v.tags.some((tag) => tag.startsWith("wcag"));
    const nivel: Nivel = buenaPractica ? "info" : v.impact === "critical" || v.impact === "serious" ? "defecto" : "aviso";
    return v.nodes.slice(0, 5).map((nodo) => ({
      tipo: buenaPractica ? "axe-buena-practica" : "axe",
      nivel,
      detalle: `${v.id}: ${v.help}`,
      elemento: nodo.target.join(" "),
      medida: v.impact ?? undefined,
      modo,
    }));
  });
}

export type PasoDeFoco = { elemento: string; indicador: boolean; tapado: boolean; oculto: boolean };

/**
 * Recorre la página con Tab: el orden del foco (para revisarlo a mano) y los elementos sin indicador
 * visible (WCAG 2.4.7) o tapados al recibir el foco (WCAG 2.4.11).
 */
export async function revisarFoco(page: Page, maximo = 60): Promise<{ orden: PasoDeFoco[]; problemas: Problema[] }> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const orden: PasoDeFoco[] = [];
  const vistos = new Set<string>();
  for (let i = 0; i < maximo; i++) {
    await page.keyboard.press("Tab");
    const paso = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const nombre =
        el.getAttribute("aria-label") ??
        ((el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || el.getAttribute("name") || "").trim().slice(0, 50);
      const indicador = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
      // Uno "solo para lectores de pantalla" (1 × 1 px) recibe el foco sin verse: no está tapado.
      const oculto = r.width <= 1 || r.height <= 1;
      const arriba = oculto ? null : document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const tapado = Boolean(arriba) && arriba !== el && !el.contains(arriba) && !arriba!.contains(el);
      const id = `${el.tagName}|${nombre}|${Math.round(r.left)}|${Math.round(r.top + window.scrollY)}`;
      return { elemento: `<${el.tagName.toLowerCase()}> ${nombre}`, indicador, tapado, oculto, id };
    });
    if (!paso || vistos.has(paso.id)) break;
    vistos.add(paso.id);
    orden.push({ elemento: paso.elemento, indicador: paso.indicador, tapado: paso.tapado, oculto: paso.oculto });
  }
  const problemas: Problema[] = orden.flatMap((paso) => [
    ...(paso.oculto ? [{ tipo: "foco", nivel: "defecto" as const, detalle: "Recibe el foco pero no se ve (oculto, solo para lectores de pantalla)", elemento: paso.elemento }] : []),
    ...(paso.indicador || paso.oculto ? [] : [{ tipo: "foco", nivel: "defecto" as const, detalle: "Recibe el foco sin indicador visible (WCAG 2.4.7)", elemento: paso.elemento }]),
    ...(paso.tapado ? [{ tipo: "foco", nivel: "defecto" as const, detalle: "Recibe el foco tapado por otro elemento (WCAG 2.4.11)", elemento: paso.elemento }] : []),
  ]);
  return { orden, problemas };
}
