# Glosario y estilo de la app

Cómo escribe Finanzas MVP: lo que ya está decidido y las palabras que usa en cada idioma. Manda sobre
una regla general. Una auditoría no marca lo que está aquí, pero puede proponer cambiarlo; si el dueño
lo aprueba, se cambia aquí y en `textos.mjs` (`VARIANTS` y las reglas), en el mismo PR que cambia los
textos.

## La marca

- **Anotado**, siempre con mayúscula, también en el logo ("Gracias por usar Anotado"). Sale de
  `BRAND_NAME` (`src/lib/brand.ts`).
- No usar "Finanzas MVP", "Finanzas" ni "Finanzas Bot", los nombres de antes. Hay una excepción: donde
  se explica el cambio, como en Google Authenticator: "Anotado (antes, Finanzas MVP)".
- **Eslogan:** "Escribe tu gasto por WhatsApp. Queda anotado." (en inglés, "Text your expense on WhatsApp.
  It's noted.").

## Trato y tono

- **Tú**, en toda la app y en el bot: "escribe", "toca", "elige". Nunca usted ni vos.
- **Quién habla:** la app, en primera del plural ("te avisamos", "borramos"); el bot, en primera del
  singular ("si me equivoqué", "ya usé todo mi cupo").
- **Cercano y directo:** sin exclamaciones de más, sin "por favor" en cada mensaje, sin culpar
  ("Revisa el correo", no "Escribiste mal el correo").
- **Español neutro con palabras de Colombia** donde la app ya las usa ("celular", "computador",
  "arriendo"), sin modismos que no se entiendan en otros países.
- **Emojis:** en el bot, con función (✅ registrado, 📊 balance, 🙂 en lo amable); en la web, solo los de
  las categorías.

## Formatos

- **Montos:** siempre `formatMoney` (CLAUDE.md → Dinero): "$1.000.000,00", sin espacio después del
  signo, y "−$50.000,00" con el signo menos tipográfico. En inglés, "$1,000,000.00".
- **Fechas:** con los formateadores de `src/lib/dates.ts`; los meses en minúscula en español ("20 de
  octubre de 2026").
- **Porcentajes:** con `formatShare`. **Por decidir:** hoy la app escribe "45%" y la RAE pide "45 %"
  (con espacio fino o normal). En inglés va pegado.
- **Números:** en cifras ("3 días").

## Mayúsculas y signos

- **Títulos, botones y pestañas:** solo la primera palabra con mayúscula ("Cambiar contraseña").
- **Las secciones se nombran como en la pantalla** y con mayúscula inicial ("en Mi cuenta", "en
  Reportes"). Un botón o una sección citados en un texto van en negrita en la web (`<strong>`) y en el
  bot (`*Reportes*`).
- **Botones en infinitivo** ("Guardar", "Eliminar mi cuenta", "Conectar WhatsApp"); las instrucciones
  a la persona, en imperativo ("Toca **Guardar**").
- **Comillas:** “ ” (las inglesas curvas), en los dos idiomas. Nunca las rectas (`"`).
- **Puntos suspensivos:** un solo carácter (`…`).
- **Rutas dentro de la app:** con flecha ("Mi cuenta → Notificaciones").
- **Separadores:** "·" entre datos de una misma línea; en el bot, " — " entre la descripción y el
  monto.
- **Punto final:** en las frases completas (ayudas, errores, avisos de más de una frase); no en
  títulos, botones, pestañas ni etiquetas. **Por decidir:** los títulos de bienvenida del inicio y del
  registro llevan punto ("Bienvenido de nuevo.") como un eslogan; la RAE no lo pone en los títulos.

## Palabras de la app

| Español | Inglés | No usar | Nota |
|---|---|---|---|
| movimiento | transaction | transacción, registro; movement, entry | Un ingreso o un egreso. |
| ingreso, Ingresos | income, Income | entrada | |
| egreso, Egresos | expense, Expenses | salida; outflow | "Gasto" sí: en "gasto fijo", "gasto promedio" y en lo que se le escribe al bot ("gasté"). |
| gasto fijo, Fijos | bill, Bills | gasto recurrente; recurring | "Bills" porque "Recurring" no cabía en 375 px. |
| Resumen | Overview | dashboard, tablero | |
| Reportes | Reports | informes | |
| Mi cuenta | My account | perfil | |
| Ayuda | Help | | |
| categoría | category | | "Otros" es la de respaldo; en inglés, su nombre lo pone el admin. |
| balance | balance | saldo | El bot entiende "saldo", pero responde "balance". |
| aviso (de un pago) | notice | recordatorio; reminder | |
| campana, notificaciones | bell, notifications | | |
| Entrar (botón), iniciar sesión | Sign in, sign in | loguearse, login; log in | |
| Salir (botón), cerrar sesión | Sign out, sign out | log out | |
| Crear cuenta, registrarte | Create account, sign up | | |
| contraseña | password | clave, password | "Clave" solo en la configuración de Google Authenticator, que la llama así. |
| correo | email | email, e-mail, mail | "Correo electrónico" se acepta la primera vez en las páginas legales. |
| verificación en dos pasos | two-step verification | 2FA, doble factor | |
| código de respaldo | backup code | | |
| conectar o vincular WhatsApp, desvincular | connect WhatsApp, unlink | desconectar | |
| eliminar | delete | suprimir; erase | En botones y títulos, "Eliminar". En las explicaciones se acepta "borrar" ("se borran tus datos"). En inglés, "remove" es quitar algo de una lista sin borrarlo (un filtro, un gasto fijo). |
| archivar, restaurar | archive, restore | | |
| suspender, reactivar | suspend, reactivate | | |
| deshacer | undo | | |
| toca, elige | tap, choose | haz clic, pulsa, presiona; click, press | La app se usa sobre todo en el celular. "Elige" para escoger una opción. |
| celular | phone | móvil, teléfono | "Número de teléfono" se acepta en las páginas legales. |
| computador | computer | ordenador, computadora | |
| la persona, la cuenta | the person, the account | | "Usuario" es el nombre del rol ("Usuario", "Administrador"). |
| admin, super admin | admin, super admin | | En el nombre del rol, "Superadministrador" ("Super administrator"). |
| el bot | the bot | | "Claude" solo en el admin, donde importa qué modelo responde. |
| app | app | aplicación (salvo en las páginas legales) | |

## Lo que queda en español a propósito

- El bot de WhatsApp (por ahora): sus mensajes y los ejemplos de lo que se le escribe ("gasté 20 mil
  en almuerzo"), también en la web en inglés.
- La política de privacidad y "Eliminar tus datos", con `lang="es"` y una nota en inglés.
- Los nombres de las categorías por defecto (el inglés lo pone el admin) y el simulador (solo en
  desarrollo).
