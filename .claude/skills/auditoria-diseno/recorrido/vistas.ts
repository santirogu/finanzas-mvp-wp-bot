import { expect, type Page } from "@playwright/test";
import { PASSWORD, uniqueEmail, visible } from "../../../../e2e/helpers";
import type { Datos, Persona } from "./datos";

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
  { id: "no-encontrada", titulo: "Página que no existe (404)", ruta: fija("/esta-pagina-no-existe") },

  // Una cuenta nueva, sin movimientos
  { id: "resumen-vacio", titulo: "Resumen sin movimientos", persona: "vacia", ruta: fija("/dashboard") },
  { id: "ingresos-vacio", titulo: "Ingresos sin movimientos", persona: "vacia", ruta: fija("/ingresos") },
  { id: "egresos-vacio", titulo: "Egresos sin movimientos", persona: "vacia", ruta: fija("/egresos") },
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
    titulo: "Conectar WhatsApp: el código",
    persona: "vacia",
    ruta: fija("/dashboard"),
    preparar: async (page) => {
      await visible(page.getByRole("button", { name: "Conectar WhatsApp" })).click();
      await expect(visible(page.getByText(/^VINCULAR \d{6}$/))).toBeVisible();
    },
  },
  { id: "cuenta", titulo: "Mi cuenta", persona: "vacia", ruta: fija("/cuenta") },

  // Una cuenta con datos normales y WhatsApp vinculado
  { id: "resumen", titulo: "Resumen con datos", persona: "datos", ruta: fija("/dashboard") },
  { id: "ingresos", titulo: "Ingresos con datos", persona: "datos", ruta: fija("/ingresos") },
  { id: "egresos", titulo: "Egresos con datos", persona: "datos", ruta: fija("/egresos") },
  { id: "editar-movimiento", titulo: "Editar un movimiento", persona: "datos", ruta: (d) => d.editar.datos },

  // Lo más largo que acepta la app: textos, montos, categorías y una lista de 25 egresos
  { id: "resumen-extremo", titulo: "Resumen con textos y montos máximos", persona: "admin", ruta: fija("/dashboard") },
  { id: "ingresos-extremo", titulo: "Ingresos con textos y montos máximos", persona: "admin", ruta: fija("/ingresos") },
  { id: "egresos-extremo", titulo: "Egresos: 25 movimientos y textos máximos", persona: "admin", ruta: fija("/egresos") },
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
