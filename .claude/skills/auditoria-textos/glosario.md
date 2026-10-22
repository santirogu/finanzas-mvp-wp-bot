# Glosario y estilo de la app

Cómo escribe Anotado: lo que ya está decidido y las palabras que usa en cada idioma. Manda sobre
una regla general. Una auditoría no marca lo que está aquí, pero puede proponer cambiarlo; si el dueño
lo aprueba, se cambia aquí y en `textos.mjs` (`VARIANTS` y las reglas), en el mismo PR que cambia los
textos.

## La marca

- **Anotado**, siempre con mayúscula, también en el logo ("Gracias por usar Anotado"). Sale de
  `BRAND_NAME` (`src/lib/brand.ts`).
- No usar "Finanzas MVP", "Finanzas" ni "Finanzas Bot", los nombres de antes. Hay una excepción: donde
  se explica el cambio, como en Google Authenticator: "Anotado (antes, Finanzas MVP)".
- **Al registrar, el bot responde "✅ Egreso Anotado: …" o "✅ Ingreso Anotado: …"**, con la A
  mayúscula de la marca. Es una decisión del dueño: no es un error de mayúsculas.
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
  las categorías. Un emoji no reemplaza el punto: "todavía no llega 🙂. Prueba…" (FundéuRAE), o el emoji al
  final del mensaje.

## Formatos

- **Montos:** siempre `formatMoney` (CLAUDE.md → Dinero): "$1.000.000,00", sin espacio después del
  signo, y "−$50.000,00" con el signo menos tipográfico. En inglés, "$1,000,000.00".
- **Fechas:** con los formateadores de `src/lib/dates.ts`; los meses en minúscula en español ("20 de
  octubre de 2026").
- **Meses abreviados:** con punto en español ("13 de oct.", "sept."), en las listas, el bot, el PDF y el
  admin (RAE). Sin punto solo donde el mes va solo, como etiqueta: los ejes de los gráficos y el selector de
  meses ("oct", `formatShortMonth`). En inglés, como los da Intl ("Oct 13").
- **Porcentajes:** con `formatPercent` (`src/lib/money.ts`): "45 %" en español, con un espacio duro para que
  no se separe del número (RAE), y "45%" en inglés. La parte de un total, con `formatShare`.
- **Millones en los ejes** ("$2,5 M"): se acepta "M" en los ejes de los gráficos y del PDF, por el espacio.
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
  títulos, subtítulos, botones, pestañas ni etiquetas ("Bienvenido de nuevo"). La excepción es el eslogan de
  la portada, que son dos frases ("Escribe tu gasto por WhatsApp. Queda anotado.").

## Palabras de la app

| Español | Inglés | No usar | Nota |
|---|---|---|---|
| movimiento | transaction | transacción, registro; movement, entry | Un ingreso o un egreso. |
| ingreso, Ingresos | income, Income | entrada | |
| egreso, Egresos | expense, Expenses | salida; outflow; spending (en títulos) | También en los títulos de los análisis: "Egresos por categoría", "Los egresos más grandes" ("Expenses by category"). "Gasto" sí: en "gasto fijo", "gasto promedio", los verbos ("qué días gastas más") y lo que se le escribe al bot ("gasté"). |
| gasto fijo, Fijos | bill, Bills | gasto recurrente; recurring | "Bills" porque "Recurring" no cabía en 375 px. |
| presupuesto, Presupuestos | budget, Budgets | límite; tope (en títulos) | El monto por mes de una categoría de egresos. En las explicaciones se acepta "tope" ("un tope por mes"). Se "pone", se "cambia" y se "quita" (no "eliminar": borra una configuración, no datos). |
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
| toca, elige | tap, choose | pulsa, presiona, selecciona; press, pick, select | La app se usa sobre todo en el celular. "Elige" para escoger una opción. "Haz clic" / "click" se aceptan solo en lo que se ve con mouse (por ejemplo, la ayuda de un gráfico que se abre al pasar el puntero). |
| registrar (un movimiento) | add | record, track | "Registrar ingreso" → "Add income"; "el bot registra" → "the bot adds". |
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
