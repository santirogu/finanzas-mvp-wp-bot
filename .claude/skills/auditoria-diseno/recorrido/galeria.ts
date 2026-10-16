// Al terminar el recorrido (globalTeardown): junta las medidas de cada grupo y motor en medidas.json,
// escribe resumen.txt (los problemas agrupados entre dispositivos: lo que lee el skill) y una
// galeria.html para comparar las capturas lado a lado (se abre en el navegador, sin servidor).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DISPOSITIVOS } from "./dispositivos";
import type { Nivel, Problema } from "./medir";
import type { Resultado } from "./recorrido.spec";

const NIVELES: Nivel[] = ["defecto", "aviso", "info"];
const ORDEN_DISPOSITIVOS = new Map(DISPOSITIVOS.map((d, i) => [d.id, i]));

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function leerResultados(salida: string): Resultado[] {
  const carpeta = path.join(salida, "medidas");
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta)
    .filter((archivo) => archivo.endsWith(".json"))
    .flatMap((archivo) => JSON.parse(readFileSync(path.join(carpeta, archivo), "utf8")) as Resultado[]);
}

type Grupo = { problema: Problema; firma: string; ejemplos: Set<string>; vistas: Set<string>; dispositivos: Set<string>; motores: Set<string>; medidas: Set<string>; veces: number };

/**
 * El componente, sin su nombre ni su texto: los botones "Editar Almuerzo" y "Editar Taxi" de la
 * lista son el mismo problema. Lo de axe (un selector CSS) queda igual.
 */
const firma = (elemento = "") => elemento.replace(/^<(\w+)(?: "[^"]*")?( class="[^"]*")?>.*$/, "<$1$2>");

/** El mismo problema en varias vistas, dispositivos, motores y elementos del mismo componente, en una sola línea. */
function agrupar(resultados: Resultado[]) {
  const grupos = new Map<string, Grupo>();
  for (const r of resultados) {
    for (const p of r.problemas) {
      const clave = [p.nivel, p.tipo, p.detalle, firma(p.elemento)].join("|");
      const grupo = grupos.get(clave) ?? { problema: p, firma: firma(p.elemento), ejemplos: new Set(), vistas: new Set(), dispositivos: new Set(), motores: new Set(), medidas: new Set(), veces: 0 };
      if (p.elemento && grupo.ejemplos.size < 3) grupo.ejemplos.add(p.elemento);
      grupo.vistas.add(r.vista);
      grupo.dispositivos.add(r.dispositivo);
      grupo.motores.add(r.motor);
      if (p.medida && grupo.medidas.size < 3) grupo.medidas.add(p.medida + (p.modo ? ` (${p.modo})` : ""));
      grupo.veces++;
      grupos.set(clave, grupo);
    }
  }
  return [...grupos.values()].sort((a, b) => NIVELES.indexOf(a.problema.nivel) - NIVELES.indexOf(b.problema.nivel) || b.veces - a.veces);
}

const ordenados = (ids: Set<string>) => [...ids].sort((a, b) => (ORDEN_DISPOSITIVOS.get(a) ?? 0) - (ORDEN_DISPOSITIVOS.get(b) ?? 0));

function resumen(salida: string, resultados: Resultado[]) {
  const grupos = agrupar(resultados);
  const capturas = resultados.reduce((total, r) => total + Object.keys(r.capturas).length, 0);
  const lineas = [
    `Recorrido de diseño: ${salida}`,
    `Motores: ${[...new Set(resultados.map((r) => r.motor))].join(", ")} · Vistas: ${new Set(resultados.map((r) => r.vista)).size} · Dispositivos: ${new Set(resultados.map((r) => r.dispositivo)).size} · Capturas: ${capturas}`,
    `Galería: ${path.join(salida, "galeria.html")}`,
  ];
  const errores = resultados.filter((r) => r.error);
  if (errores.length > 0) {
    lineas.push("", `VISTAS QUE NO SE PUDIERON RECORRER (${errores.length})`);
    for (const r of errores) lineas.push(`- ${r.vista} en ${r.dispositivo} (${r.motor}): ${r.error}`);
  }
  for (const nivel of NIVELES) {
    const delNivel = grupos.filter((g) => g.problema.nivel === nivel);
    lineas.push("", `${nivel.toUpperCase()}S (${delNivel.length})`);
    // De los informativos, solo una muestra por tipo: son para el revisor, no hallazgos.
    const mostrados = nivel === "info" ? [...new Set(delNivel.map((g) => g.problema.tipo))].flatMap((tipo) => delNivel.filter((g) => g.problema.tipo === tipo).slice(0, 10)) : delNivel;
    for (const g of mostrados) {
      const { tipo, detalle } = g.problema;
      const ejemplos = [...g.ejemplos].filter((e) => e !== g.firma);
      lineas.push(
        `- [${tipo}] ${detalle}${g.firma ? ` — ${g.firma}` : ""} (${g.veces} ${g.veces === 1 ? "vez" : "veces"})`,
        `    vistas: ${[...g.vistas].join(", ")} · dispositivos: ${ordenados(g.dispositivos).join(", ")} · motores: ${[...g.motores].join(", ")}${g.medidas.size ? ` · medida: ${[...g.medidas].join("; ")}` : ""}`,
        ...(ejemplos.length ? [`    por ejemplo: ${ejemplos.join(" · ")}`] : []),
      );
    }
  }
  return lineas.join("\n");
}

function figura(r: Resultado) {
  const dispositivo = DISPOSITIVOS.find((d) => d.id === r.dispositivo);
  const cuenta = (nivel: Nivel) => r.problemas.filter((p) => p.nivel === nivel).length;
  // Un renglón por problema; los elementos y sus medidas, al pasar el mouse.
  const unicos = new Map<string, { p: Problema; detalles: string[] }>();
  for (const p of r.problemas) {
    const clave = `${p.nivel}|${p.detalle}|${p.modo ?? ""}`;
    const item = unicos.get(clave) ?? { p, detalles: [] };
    item.detalles.push([p.elemento, p.medida].filter(Boolean).join(" · "));
    unicos.set(clave, item);
  }
  const item = ({ p, detalles }: { p: Problema; detalles: string[] }) =>
    `<li class="${p.nivel}" title="${escapar(detalles.slice(0, 8).join("\n"))}">${escapar(p.detalle)}${p.modo ? ` <small>(${p.modo})</small>` : ""}${detalles.length > 1 ? ` <small>×${detalles.length}</small>` : ""}</li>`;
  const lista = [...unicos.values()];
  const imagen = (modo: "claro" | "oscuro") => {
    const captura = r.capturas[modo];
    return captura
      ? `<a class="${modo} marco" href="${escapar(captura)}" target="_blank"><img loading="lazy" src="${escapar(captura)}" alt="${escapar(`${r.titulo}, ${dispositivo?.nombre ?? r.dispositivo}, modo ${modo}`)}"></a>`
      : `<p class="${modo} sin-captura">Sin captura en modo ${modo}</p>`;
  };
  return `<figure data-defectos="${cuenta("defecto")}" data-grupo="${escapar(r.grupo)}">
  ${r.error ? `<p class="error">No se pudo recorrer: ${escapar(r.error)}</p>` : `${imagen("claro")}${imagen("oscuro")}`}
  <figcaption><strong>${escapar(dispositivo?.nombre ?? r.dispositivo)}</strong> <span>${dispositivo ? `${dispositivo.ancho}×${dispositivo.alto}` : ""}</span>
    <ul>${lista.filter(({ p }) => p.nivel !== "info").map(item).join("")}</ul>
    ${cuenta("info") ? `<details><summary>${cuenta("info")} informativos</summary><ul>${lista.filter(({ p }) => p.nivel === "info").map(item).join("")}</ul></details>` : ""}
  </figcaption>
</figure>`;
}

function galeria(salida: string, resultados: Resultado[]) {
  const motores = [...new Set(resultados.map((r) => r.motor))];
  // En el orden del recorrido (el de vistas.ts), con su título.
  const vistas = [...new Map(resultados.map((r) => [r.vista, { id: r.vista, titulo: r.titulo }])).values()];
  const defectosDe = (id: string) => resultados.filter((r) => r.vista === id).reduce((n, r) => n + r.problemas.filter((p) => p.nivel === "defecto").length, 0);
  const secciones = vistas.map((v) => {
    const filas = motores.map((motor) => {
      const figuras = resultados
        .filter((r) => r.vista === v.id && r.motor === motor)
        .sort((a, b) => (ORDEN_DISPOSITIVOS.get(a.dispositivo) ?? 0) - (ORDEN_DISPOSITIVOS.get(b.dispositivo) ?? 0))
        .map(figura)
        .join("\n");
      return `<div class="fila" data-motor="${motor}">${figuras}</div>`;
    });
    const ruta = resultados.find((r) => r.vista === v.id)?.ruta ?? "";
    return `<section id="${v.id}" data-defectos="${defectosDe(v.id)}"><h2>${escapar(v.titulo)} <code>${escapar(ruta)}</code></h2>${filas.join("\n")}</section>`;
  });
  const indice = vistas.map((v) => `<li data-defectos="${defectosDe(v.id)}"><a href="#${v.id}">${escapar(v.titulo)}</a>${defectosDe(v.id) ? ` <b>${defectosDe(v.id)}</b>` : ""}</li>`).join("");
  const opciones = (nombre: string, valores: string[]) =>
    valores.map((valor, i) => `<label><input type="radio" name="${nombre}" value="${valor}"${i === 0 ? " checked" : ""}> ${valor}</label>`).join(" ");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Galería de diseño</title>
<style>
  :root { color-scheme: light dark; --fondo: #f6f7f9; --superficie: #fff; --texto: #14171c; --suave: #5f6672; --borde: #e3e6eb; --defecto: #b91c1c; --aviso: #a16207; }
  @media (prefers-color-scheme: dark) { :root { --fondo: #0d1014; --superficie: #161a20; --texto: #eceff3; --suave: #98a1ad; --borde: #262c35; --defecto: #f87171; --aviso: #facc15; } }
  body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: var(--fondo); color: var(--texto); }
  header { position: sticky; top: 0; z-index: 1; padding: 12px 16px; background: var(--superficie); border-bottom: 1px solid var(--borde); display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: center; }
  header h1 { font-size: 16px; margin: 0; }
  nav ul { columns: 3 240px; padding: 8px 16px 8px 32px; margin: 0; }
  nav b, figure li.defecto { color: var(--defecto); }
  section { padding: 8px 16px 24px; border-top: 1px solid var(--borde); }
  section h2 { font-size: 15px; margin: 12px 0; }
  code { color: var(--suave); font-weight: normal; }
  .fila { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; align-items: flex-start; }
  figure { margin: 0; flex: 0 0 220px; background: var(--superficie); border: 1px solid var(--borde); border-radius: 8px; overflow: hidden; }
  figure[data-grupo="tableta"] { flex-basis: 300px; }
  figure[data-grupo="computador"], figure[data-grupo="accesibilidad"] { flex-basis: 380px; }
  figure[data-defectos]:not([data-defectos="0"]) { border-color: var(--defecto); }
  /* La parte de arriba de la captura, a todo el ancho; la entera se abre con un clic. */
  .marco { display: block; height: 420px; overflow: hidden; background: var(--fondo); }
  .marco img { display: block; width: 100%; height: auto; }
  figcaption { padding: 8px; font-size: 12px; }
  figcaption span, small { color: var(--suave); }
  figcaption ul { margin: 6px 0 0; padding-left: 16px; }
  li.aviso { color: var(--aviso); }
  .sin-captura, .error { height: 420px; margin: 0; display: grid; place-items: center; color: var(--suave); text-align: center; padding: 8px; }
  .error { color: var(--defecto); }
  body[data-modo="claro"] .oscuro, body[data-modo="oscuro"] .claro { display: none; }
  ${motores.map((m) => `body:not([data-motor="${m}"]) .fila[data-motor="${m}"]`).join(", ")} { display: none; }
  body.solo-defectos figure[data-defectos="0"], body.solo-defectos section[data-defectos="0"], body.solo-defectos nav li[data-defectos="0"] { display: none; }
</style>
</head>
<body data-motor="${motores[0] ?? ""}" data-modo="claro">
<header>
  <h1>Galería de diseño · ${escapar(path.basename(salida))}</h1>
  <span>Motor: ${opciones("motor", motores)}</span>
  <span>Modo: ${opciones("modo", ["claro", "oscuro"])}</span>
  <label><input type="checkbox" id="solo-defectos"> Solo con defectos</label>
</header>
<nav><ul>${indice}</ul></nav>
${secciones.join("\n")}
<script>
  for (const input of document.querySelectorAll("input[type=radio]")) input.addEventListener("change", () => (document.body.dataset[input.name] = input.value));
  document.getElementById("solo-defectos").addEventListener("change", (e) => document.body.classList.toggle("solo-defectos", e.target.checked));
</script>
</body>
</html>
`;
}

export default async function armarGaleria() {
  const salida = path.resolve(process.env.AUDITORIA_SALIDA!);
  const resultados = leerResultados(salida);
  if (resultados.length === 0) return;
  writeFileSync(path.join(salida, "medidas.json"), JSON.stringify(resultados, null, 2));
  const texto = resumen(salida, resultados);
  writeFileSync(path.join(salida, "resumen.txt"), `${texto}\n`);
  writeFileSync(path.join(salida, "galeria.html"), galeria(salida, resultados));
  process.stdout.write(`\n${texto.split("\n").slice(0, 80).join("\n")}\n\n(resumen completo en ${path.join(salida, "resumen.txt")})\n`);
}
