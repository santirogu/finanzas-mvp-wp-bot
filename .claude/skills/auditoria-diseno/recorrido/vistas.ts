import { expect, type Page } from "@playwright/test";
import { PASSWORD, adminCommand, uniqueEmail, visible } from "../../../../e2e/helpers";
import { MES_ANTERIOR, type Datos, type Persona } from "./datos";

// Las páginas y los estados que recorre la auditoría. Para el modo "cambios", el skill elige las
// vistas de las páginas que tocó la rama (AUDITORIA_VISTAS=id1,id2). Si agregas una página a la app,
// agrégala aquí.

export type Vista = {
  id: string;
  titulo: string;
  /** Con qué cuenta se abre; sin persona, sin sesión. */
  persona?: Persona;
  /** Otras cuentas que la vista necesita que existan. */
  necesita?: Persona[];
  ruta: (datos: Datos) => string | undefined;
  /** Lo que hay que hacer después de abrir la página: abrir una ventana, enviar vacío, etc. */
  preparar?: (page: Page, datos: Datos) => Promise<void>;
};

const dialogo = (page: Page) => page.getByRole("dialog");

const fija = (ruta: string) => () => ruta;

export const VISTAS: Vista[] = [
  // Sin sesión
  { id: "inicio", titulo: "Inicio público", ruta: fija("/") },
  { id: "login", titulo: "Iniciar sesión", ruta: fija("/login") },
  {
    id: "login-error",
    titulo: "Iniciar sesión con un error",
    ruta: fija("/login"),
    preparar: async (page) => {
      await page.getByLabel("Correo").fill(uniqueEmail());
      await page.getByLabel("Contraseña").fill("no-es-la-clave-123");
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(visible(page.locator("form").getByRole("alert"))).toBeVisible();
    },
  },
  {
    id: "login-dos-pasos",
    titulo: "Segundo paso del login (admin)",
    necesita: ["admin"],
    ruta: fija("/login"),
    preparar: async (page, datos) => {
      await page.getByLabel("Correo").fill(datos.correos.admin!);
      await page.getByLabel("Contraseña").fill(PASSWORD);
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page.getByLabel("Código de 6 dígitos")).toBeVisible();
    },
  },
  { id: "registro", titulo: "Crear cuenta", ruta: fija("/registro") },
  {
    id: "registro-sugerencia",
    titulo: "Crear cuenta con la sugerencia de correo",
    ruta: fija("/registro"),
    preparar: async (page) => {
      const email = page.getByLabel("Correo", { exact: true });
      await email.fill("ana@gmal.com");
      await email.blur();
      await expect(visible(page.getByText(/Quisiste decir/))).toBeVisible();
    },
  },
  { id: "privacidad", titulo: "Política de privacidad", ruta: fija("/privacidad") },
  { id: "eliminar-datos", titulo: "Eliminar mis datos", ruta: fija("/eliminar-datos") },
  { id: "cuenta-eliminada", titulo: "Cuenta eliminada", ruta: fija("/cuenta-eliminada") },

  // Una cuenta nueva, sin movimientos
  { id: "resumen-vacio", titulo: "Resumen sin movimientos", persona: "vacia", ruta: fija("/dashboard") },
  { id: "ingresos-vacio", titulo: "Ingresos sin movimientos", persona: "vacia", ruta: fija("/ingresos") },
  { id: "egresos-vacio", titulo: "Egresos sin movimientos", persona: "vacia", ruta: fija("/egresos") },
  { id: "fijos-vacio", titulo: "Fijos sin movimientos", persona: "vacia", ruta: fija("/gastos-fijos") },
  { id: "reportes-vacio", titulo: "Reportes sin movimientos", persona: "vacia", ruta: fija("/reportes") },
  {
    id: "formulario-errores",
    titulo: "Formulario de egreso enviado vacío",
    persona: "vacia",
    ruta: fija("/egresos"),
    preparar: async (page) => {
      await visible(page.getByRole("button", { name: "Registrar egreso" })).click();
      await expect(visible(page.getByText("Escribe el monto."))).toBeVisible();
    },
  },
  {
    id: "whatsapp-codigo",
    titulo: "Conectar WhatsApp (en Mi cuenta): el código",
    persona: "vacia",
    ruta: fija("/cuenta"),
    preparar: async (page) => {
      await visible(page.getByRole("button", { name: "Conectar WhatsApp" })).click();
      await expect(visible(page.getByText(/^VINCULAR \d{6}$/))).toBeVisible();
    },
  },
  { id: "cuenta", titulo: "Mi cuenta (sin WhatsApp: para conectarlo)", persona: "vacia", ruta: fija("/cuenta") },
  {
    id: "cuenta-contrasena",
    titulo: "Mi cuenta: cambiar la contraseña (el formulario abierto)",
    persona: "vacia",
    ruta: fija("/cuenta"),
    preparar: async (page) => {
      await visible(page.getByRole("button", { name: "Cambiar contraseña" })).click();
      await expect(visible(page.getByLabel("Contraseña actual"))).toBeFocused();
    },
  },
  { id: "cuenta-whatsapp", titulo: "Mi cuenta con el WhatsApp vinculado", persona: "datos", ruta: fija("/cuenta") },
  // Con sesión: sin ella, el proxy lleva al login cualquier dirección que no conoce (a propósito).
  { id: "no-encontrada", titulo: "Página que no existe (404)", persona: "vacia", ruta: fija("/esta-pagina-no-existe") },

  // Una cuenta con datos normales y WhatsApp vinculado
  { id: "resumen", titulo: "Resumen con datos", persona: "datos", ruta: fija("/dashboard") },
  {
    id: "menu-cuenta",
    titulo: "Menú de la cuenta abierto (nombre largo)",
    persona: "datos",
    ruta: fija("/dashboard"),
    preparar: async (page) => {
      await visible(page.getByRole("button", { name: /^Tu cuenta: / })).click();
      await expect(visible(page.getByRole("group", { name: "Tu cuenta" }))).toBeVisible();
    },
  },
  {
    id: "menu-cuenta-admin",
    titulo: "Menú de la cuenta abierto, del super admin (escudo y etiqueta dorados)",
    persona: "admin",
    ruta: fija("/dashboard"),
    preparar: async (page, datos) => {
      // Cada grupo del recorrido crea su propio admin y la marca de super admin (una sola) queda en el
      // último: se le vuelve a poner a este justo antes de la captura. Con grupos en paralelo, otro se la
      // puede quitar en el medio; para ver el dorado en todas las capturas, correr con --workers=1.
      adminCommand("super", datos.correos.admin!);
      await page.reload();
      await visible(page.getByRole("button", { name: /^Tu cuenta: / })).click();
      await expect(visible(page.getByRole("group", { name: "Tu cuenta" }))).toBeVisible();
    },
  },
  { id: "ingresos", titulo: "Ingresos con datos", persona: "datos", ruta: fija("/ingresos") },
  { id: "egresos", titulo: "Egresos con datos", persona: "datos", ruta: fija("/egresos") },
  { id: "editar-movimiento", titulo: "Editar un movimiento", persona: "datos", ruta: (d) => d.editar.datos },
  { id: "egresos-borrado", titulo: "Egresos: aviso emergente rojo después de borrar (con Deshacer)", persona: "datos", ruta: (d) => d.borrado },
  {
    id: "egresos-sugerencias",
    titulo: "Egresos: sugerencias de la descripción abiertas",
    persona: "datos",
    ruta: fija("/egresos"),
    preparar: async (page) => {
      await visible(page.getByRole("combobox", { name: "Descripción" })).pressSequentially("al");
      await expect(visible(page.getByRole("listbox", { name: "Descripciones que ya usaste" }))).toBeVisible();
    },
  },
  {
    id: "egresos-buscar",
    titulo: "Egresos: buscando en la lista del mes (con lo que coincide marcado)",
    persona: "datos",
    ruta: fija("/egresos"),
    preparar: async (page) => {
      // "ta": "Taxi al aeropuerto" (al comienzo) y "Pago de la tarjeta de crédito" (a mitad del texto).
      await visible(page.getByRole("searchbox", { name: "Buscar egresos" })).fill("ta");
      await expect(visible(page.getByRole("heading", { name: /^2 de \d+ movimientos/ }))).toBeVisible();
    },
  },
  {
    id: "egresos-buscar-sin-resultados",
    titulo: "Egresos: una búsqueda sin resultados",
    persona: "datos",
    ruta: fija("/egresos"),
    preparar: async (page) => {
      await visible(page.getByRole("searchbox", { name: "Buscar egresos" })).fill("zzz");
      await expect(visible(page.getByText(/^Ningún egreso coincide/))).toBeVisible();
    },
  },
  // El aviso verde que pide la URL después de guardar cambios (?aviso=guardado); dura 4 segundos.
  { id: "egresos-guardado", titulo: "Egresos: aviso emergente verde (Cambios guardados)", persona: "datos", ruta: fija("/egresos?aviso=guardado") },
  { id: "resumen-mes-anterior", titulo: "Resumen del mes anterior", persona: "datos", ruta: fija(`/dashboard?mes=${MES_ANTERIOR}`) },
  {
    id: "resumen-tarjeta-meses",
    titulo: "Resumen: tarjeta de meses abierta",
    persona: "datos",
    ruta: fija(`/dashboard?mes=${MES_ANTERIOR}`),
    preparar: async (page) => {
      await visible(page.getByRole("button", { expanded: false }).filter({ hasText: / de \d{4}$/ })).click();
      await expect(visible(page.getByRole("group", { name: "Elegir un mes" }))).toBeVisible();
    },
  },
  { id: "egresos-mes-anterior", titulo: "Egresos del mes anterior", persona: "datos", ruta: fija(`/egresos?mes=${MES_ANTERIOR}`) },
  { id: "fijos", titulo: "Fijos con cuatro meses de datos (detectados, agregados y quitados)", persona: "datos", ruta: fija("/gastos-fijos") },
  { id: "reportes", titulo: "Reportes con cuatro meses de datos (promedios, sin los gastos fijos)", persona: "datos", ruta: fija("/reportes") },
  {
    id: "reportes-detalle",
    titulo: "Reportes: la tabla mes a mes abierta y el detalle de un mes del gráfico",
    persona: "datos",
    ruta: fija("/reportes"),
    preparar: async (page) => {
      await visible(page.getByText("Ver mes a mes")).click();
      // La tabla (desde 640 px) o, en el celular, la lista de los meses.
      await expect(visible(page.locator("details[open] table, details[open] ul"))).toBeVisible();
      // Con el mouse en el último mes del gráfico (el actual): su detalle aparece debajo. Con el foco no
      // sirve: el recorrido con Tab del computador lo mueve antes de la captura.
      // Los meses del gráfico (no los de la tabla): su nombre trae los tres montos.
      const meses = visible(page.getByRole("region", { name: "Ingresos y egresos por mes" }).getByRole("link", { name: /: ingresos \$/ }));
      await meses.last().hover();
      await expect(visible(page.getByText(/ · Ingresos \$/)).first()).toBeVisible();
    },
  },
  {
    id: "egresos-tarjeta-meses",
    titulo: "Egresos: tarjeta de meses abierta",
    persona: "datos",
    ruta: fija(`/egresos?mes=${MES_ANTERIOR}`),
    preparar: async (page) => {
      await visible(page.getByRole("button", { expanded: false }).filter({ hasText: / de \d{4}$/ })).click();
      await expect(visible(page.getByRole("group", { name: "Elegir un mes" }))).toBeVisible();
    },
  },

  // Lo más largo que acepta la app: textos, montos, categorías y una lista de 25 egresos
  { id: "resumen-extremo", titulo: "Resumen con textos y montos máximos", persona: "admin", ruta: fija("/dashboard") },
  { id: "ingresos-extremo", titulo: "Ingresos con textos y montos máximos", persona: "admin", ruta: fija("/ingresos") },
  { id: "egresos-extremo", titulo: "Egresos: 25 movimientos y textos máximos", persona: "admin", ruta: fija("/egresos") },
  { id: "fijos-extremo", titulo: "Fijos con textos y montos máximos", persona: "admin", ruta: fija("/gastos-fijos") },
  { id: "reportes-extremo", titulo: "Reportes con textos y montos máximos", persona: "admin", ruta: fija("/reportes") },
  {
    id: "fijos-agregar",
    titulo: "Fijos: agregar un gasto fijo (el selector de egresos abierto)",
    persona: "datos",
    ruta: fija("/gastos-fijos"),
    preparar: async (page) => {
      const fijos = visible(page.getByRole("region", { name: "Gastos fijos" }));
      await fijos.getByRole("button", { name: "Agregar un gasto fijo" }).click();
      await expect(fijos.getByLabel("Egreso", { exact: true })).toBeFocused();
      await fijos.scrollIntoViewIfNeeded();
    },
  },
  {
    id: "fijos-historial",
    titulo: "Fijos: el historial de un gasto fijo (el mercado, que cambia cada mes) con la nota abierta",
    persona: "datos",
    ruta: fija("/gastos-fijos"),
    preparar: async (page) => {
      const fijos = visible(page.getByRole("region", { name: "Gastos fijos" }));
      await fijos.getByRole("button", { name: /^Historial de Mercado del mes/ }).click();
      await fijos.getByRole("button", { name: /^Agregar nota del cambio/ }).first().click();
      await expect(fijos.getByLabel(/^Nota del cambio/)).toBeFocused();
      await fijos.scrollIntoViewIfNeeded();
    },
  },
  {
    id: "reportes-calendario-mes-anterior",
    titulo: "Reportes: ¿Qué días gastas más?, en el mes anterior (solo con gastos fijos: ningún día con tono)",
    persona: "datos",
    ruta: fija(`/reportes?calendario=${MES_ANTERIOR}`),
    preparar: async (page) => {
      const calendario = visible(page.getByRole("region", { name: "¿Qué días gastas más?" }));
      await expect(calendario.getByRole("link", { name: /^Mes siguiente: / })).toBeVisible();
      await calendario.scrollIntoViewIfNeeded();
    },
  },
  {
    id: "reportes-descargas",
    titulo: "Reportes: la lista de descargas abierta (CSV y PDF)",
    persona: "datos",
    ruta: fija("/reportes"),
    preparar: async (page) => {
      await visible(page.getByRole("button", { name: "Descargar" })).click();
      await expect(visible(page.getByRole("group", { name: "Opciones de descarga" }))).toBeVisible();
    },
  },
  {
    id: "reportes-gastos-grandes",
    titulo: "Reportes: los gastos más grandes con los siguientes abiertos (textos y montos máximos)",
    persona: "admin",
    ruta: fija("/reportes"),
    preparar: async (page) => {
      const seccion = visible(page.getByRole("region", { name: "Los gastos más grandes" }));
      await seccion.getByText(/^Ver (el|los \d+) siguientes?$/).click();
      await expect(seccion.locator("details[open]")).toBeVisible();
      await seccion.scrollIntoViewIfNeeded();
    },
  },
  { id: "editar-extremo", titulo: "Editar un movimiento con textos máximos", persona: "admin", ruta: (d) => d.editar.admin },

  // Administración
  { id: "admin-inicio", titulo: "Administración: inicio", persona: "admin", ruta: fija("/admin") },
  { id: "admin-historial", titulo: "Administración: historial", persona: "admin", ruta: fija("/admin/historial") },
  { id: "admin-usuarios", titulo: "Administración: usuarios", persona: "admin", ruta: fija("/admin/usuarios") },
  {
    id: "admin-usuario",
    titulo: "Administración: detalle de una cuenta",
    persona: "admin",
    necesita: ["datos"],
    ruta: (d) => d.cuentaDatos,
  },
  {
    id: "admin-usuario-suspender",
    titulo: "Administración: ventana para suspender una cuenta",
    persona: "admin",
    necesita: ["datos"],
    ruta: (d) => d.cuentaDatos,
    preparar: async (page) => {
      await visible(page.getByRole("region", { name: "Zona de peligro" })).getByRole("button", { name: "Suspender" }).click();
      await expect(dialogo(page)).toBeVisible();
    },
  },
  // El admin del recorrido es el super admin: puede dar el rol de admin (con su código) y quitárselo a otro.
  {
    id: "admin-usuario-hacer-admin",
    titulo: "Administración: ventana para hacer admin a una cuenta (super admin)",
    persona: "admin",
    necesita: ["datos"],
    ruta: (d) => d.cuentaDatos,
    preparar: async (page) => {
      await visible(page.getByRole("region", { name: "Zona de peligro" })).getByRole("button", { name: "Hacer admin" }).click();
      await expect(dialogo(page)).toBeVisible();
    },
  },
  {
    id: "admin-usuario-admin",
    titulo: "Administración: la cuenta de otro admin (el super admin puede quitarle el rol)",
    persona: "admin",
    ruta: (d) => d.cuentaOtroAdmin,
  },
  // Con la persona de datos, para que haya mensajes del bot (vinculación, movimientos y Claude).
  { id: "admin-bot", titulo: "Administración: bot de WhatsApp", persona: "admin", necesita: ["datos"], ruta: fija("/admin/bot") },
  // Con una barra tocada (un resultado) y Por cuenta ordenado por mensajes.
  {
    id: "admin-bot-filtrado",
    titulo: "Administración: bot de WhatsApp filtrado por un resultado",
    persona: "admin",
    necesita: ["datos"],
    ruta: fija("/admin/bot?resultado=registrado&orden=mensajes"),
  },
  // Probar las conexiones solo lee (contra los servidores falsos): se ven los resultados.
  {
    id: "admin-bot-conexiones",
    titulo: "Administración: resultado de probar las conexiones del bot",
    persona: "admin",
    ruta: fija("/admin/bot"),
    preparar: async (page) => {
      const conexiones = visible(page.getByRole("region", { name: "Conexiones" }));
      await conexiones.getByRole("button", { name: "Probar conexiones" }).click();
      await expect(conexiones.getByRole("listitem")).toHaveCount(2);
    },
  },
  // Solo se abren: enviarlas cambiaría la configuración de toda la app (y pedirían el código).
  {
    id: "admin-bot-pausar",
    titulo: "Administración: ventana para pausar Claude",
    persona: "admin",
    ruta: fija("/admin/bot"),
    preparar: async (page) => {
      await visible(page.getByRole("region", { name: "Configuración" })).getByRole("button", { name: "Pausar Claude" }).click();
      await expect(dialogo(page)).toBeVisible();
    },
  },
  {
    id: "admin-bot-tope-mensual",
    titulo: "Administración: ventana del tope mensual de tokens",
    persona: "admin",
    ruta: fija("/admin/bot"),
    preparar: async (page) => {
      await visible(page.getByRole("region", { name: "Configuración" }))
        .getByRole("button", { name: "Cambiar el tope mensual de tokens" })
        .click();
      await expect(dialogo(page)).toBeVisible();
    },
  },
  {
    id: "admin-bot-topes",
    titulo: "Administración: ventana de los topes del bot",
    persona: "admin",
    ruta: fija("/admin/bot"),
    preparar: async (page) => {
      await visible(page.getByRole("region", { name: "Configuración" })).getByRole("button", { name: "Cambiar los topes por cuenta" }).click();
      await expect(dialogo(page)).toBeVisible();
    },
  },
  { id: "admin-categorias", titulo: "Administración: categorías", persona: "admin", ruta: fija("/admin/categorias") },
  {
    id: "admin-categoria-nueva",
    titulo: "Administración: ventana de nueva categoría",
    persona: "admin",
    ruta: fija("/admin/categorias"),
    preparar: async (page) => {
      await visible(page.getByRole("button", { name: "Nueva categoría" })).click();
      await expect(dialogo(page)).toBeVisible();
    },
  },
  {
    id: "admin-categoria-archivar",
    titulo: "Administración: archivar una categoría (con código)",
    persona: "admin",
    ruta: fija("/admin/categorias"),
    preparar: async (page, datos) => {
      const nombre = datos.categoriaLarga!;
      const fila = visible(page.getByRole("listitem").filter({ has: page.locator("p", { hasText: nombre }) }));
      await fila.getByRole("button", { name: `Más acciones para ${nombre}` }).click();
      await fila.getByRole("button", { name: /^Archivar/ }).click();
      await expect(dialogo(page)).toBeVisible();
    },
  },
  { id: "admin-seguridad", titulo: "Administración: verificación en dos pasos", persona: "admin", ruta: fija("/admin/seguridad") },
];

/** Las vistas pedidas (AUDITORIA_VISTAS=id1,id2; vacío = todas). Falla si un id no existe. */
export function vistasPedidas(filtro = process.env.AUDITORIA_VISTAS ?? ""): Vista[] {
  const ids = filtro.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return VISTAS;
  const desconocidas = ids.filter((id) => !VISTAS.some((vista) => vista.id === id));
  if (desconocidas.length > 0) {
    throw new Error(`Vistas que no existen: ${desconocidas.join(", ")}. Las que hay: ${VISTAS.map((v) => v.id).join(", ")}`);
  }
  return VISTAS.filter((vista) => ids.includes(vista.id));
}

/** Las cuentas que hay que crear para esas vistas. */
export function personasNecesarias(vistas: Vista[]): Set<Persona> {
  return new Set(vistas.flatMap((vista) => [...(vista.persona ? [vista.persona] : []), ...(vista.necesita ?? [])]));
}
