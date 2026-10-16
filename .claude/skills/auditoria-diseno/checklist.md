# Checklist de la auditoría de diseño

Cada punto dice qué revisar, dónde y cómo. **[M]** = lo mide el recorrido (`recorrido/medir.ts`):
confírmalo en la captura y busca la causa. Lo demás se revisa en las capturas, en los flujos o en el
código. Los archivos clave:
- `src/app/globals.css`: colores (tokens), la clase `input`, `btn-primary` y `card`;
- `src/app/(app)/layout.tsx`: encabezado y pestañas;
- `src/components/`: formulario y lista de movimientos;
- `src/app/(app)/admin/`: la administración y sus ventanas (`admin-dialog.tsx`).

## 1. Responsividad y renderizado

- **[M] Nada se sale de la pantalla** ni hay scroll de lado, en ningún ancho (320 a 1920).
  - Causa típica: una rejilla con columnas solo desde un ancho (`lg:grid-cols-5`) y sin
    `grid-cols-1`, o un hijo flex sin `min-w-0` (CLAUDE.md → Celular).
- **[M] Textos largos:** cortados con "…" donde se espera (descripciones de la lista), nunca cortados
  sin aviso ni encimados.
  - Prueba con los textos máximos: categoría de 40 caracteres, descripción de 140, nombre de 80,
    correo largo y monto de $99.999.999.999,99.
  - ¿Se pierde información importante con el "…"? Por ejemplo, dos movimientos que se ven iguales.
- **Cada corte de Tailwind** (`sm` 640, `md` 768, `lg` 1024): a los dos lados del corte, ¿el diseño
  tiene sentido?
  - Revisa sobre todo el iPad vertical (820). Una columna de 788 px con campos de todo el ancho, o
    tarjetas estiradas con mucho espacio vacío, es una sugerencia; si se ve roto, es un defecto.
- **Celular horizontal** (956 × 440): el encabezado y las pestañas no se comen la pantalla. Lo
  importante (el formulario, el botón principal) se alcanza sin scroll excesivo.
- **Monitor** (1920): el contenido centrado no se ve perdido. Los totales y las listas no quedan
  demasiado lejos de sus etiquetas.
- **Ventanas** (`<dialog>`): caben en la pantalla, se desplazan por dentro si son altas (celular
  horizontal) y el fondo no se mueve.
- **[M] Contenedores con scroll de lado** (la barra de secciones del admin): ¿se nota que hay más
  opciones? Un corte a la mitad de una palabra lo sugiere; uno justo entre dos opciones, no.
- **Imágenes y emojis:** los emojis de categorías se ven en los dos motores y no desalinean las
  filas. El punto "•" de respaldo se ve centrado.

## 2. Safari de iOS (iPhone y iPad)

Solo se ve en el simulador o en un dispositivo real; en WebKit de Playwright, a medias.

- **[M] Letra de 16 px en todos los campos** en pantallas táctiles, también en el celular horizontal
  y en el iPad (más de 640 px). Con menos, Safari hace zoom al tocarlos y la página queda ampliada.
  - La clase `input` baja a 14 px solo con mouse (`pointer-fine:text-sm`). Un campo con su propia
    letra chica según el ancho (`sm:text-sm`) vuelve a hacer zoom en el iPad y el celular horizontal.
- **Campo de fecha:** el mismo alto que los demás, el texto a la izquierda, el selector nativo se
  abre bien y respeta `max` (no deja elegir días futuros).
- **`<select>`:** la lista nativa muestra los emojis y las categorías largas completas. Cerrado, se ve
  como los demás campos, también en Safari de Mac: **[M]** `campos-desparejos` (en WebKit).
- **Teclado:** al abrirse, el campo enfocado queda a la vista y nada fijo (un botón abajo) lo tapa.
- **Barra de Safari** (abajo, en iOS 26) y **notch:** nada importante queda debajo. Si algún día hay
  elementos fijos abajo, usar `env(safe-area-inset-bottom)`.
- **`100vh`:** en iOS no descuenta la barra de Safari; para alturas de pantalla completa, `dvh`.
- **Rotar el dispositivo** con un formulario a medio llenar no pierde lo escrito.

## 3. UI: consistencia visual

- **Colores solo de los tokens** (`--brand`, `--income`, `--expense`, `--danger`, `--admin`…): sin
  colores sueltos en las clases (`text-red-500`, `#hex`).
  - `grep -rnE "(text|bg|border)-(red|green|blue|gray|slate|zinc|orange)-[0-9]" src/app src/components`.
- **Ingresos en verde con "+", egresos en naranja con "−", en todas partes.** El color nunca es la
  única señal. Los errores y las zonas de peligro van en rojo (`danger`), nunca en el naranja de
  los egresos.
- **Dinero siempre con `formatMoney`** ("$1.000.000,00"), alineado con `tabular-nums` en listas y
  totales.
- **Tipografía:** una escala corta y repetida (títulos `text-2xl`, secciones `font-semibold`, ayudas
  `text-xs text-muted`). Una página que se sale de esa escala es una sugerencia.
- **Espaciado:** las tarjetas y formularios usan los mismos rellenos (`p-4 sm:p-5`, `space-y-4`, `gap-3`).
  Lo que se ve apretado o desalineado frente a sus vecinos (una fila, un ícono, un botón) es un
  defecto si se nota en la captura.
- **Estados de cada control:** normal, con el mouse encima, con el foco, deshabilitado,
  cargando ("Guardando…") y con error. Todos se distinguen, en claro y en oscuro.
- **Modo oscuro a la par del claro:** nada queda blanco, invisible o con un ícono del sistema en el
  color equivocado (`color-scheme` en `globals.css`). Mira cada captura oscura completa, no solo el
  contraste que mide axe.
- **Componentes iguales se ven iguales:** las ventanas de la administración, los chips de filtros,
  las tarjetas del inicio, los botones primarios y secundarios.
- **Íconos:** del mismo estilo y tamaño, con nombre accesible si están solos (`aria-label`).

## 4. UX: flujos y textos

Recorre cada flujo como alguien que lo usa por primera vez:
- **Registro y login:** el error dice qué pasó y qué hacer. La sugerencia de correo ("¿Quisiste
  decir…?") se entiende. Los dos pasos del admin explican qué código pedir y ofrecen el de respaldo.
- **Registrar un movimiento:**
  - qué teclado abre cada campo: `inputMode="decimal"` en el monto;
  - los puntos de miles mientras se escribe, y la confirmación ("✓ Egreso registrado");
  - que el foco vuelva al monto para registrar otro.
- **Editar y borrar:**
  - ¿borrar pide confirmación o se puede deshacer? Borrar con un toque sin vuelta atrás, en un
    botón chico al lado de "Editar", es un hallazgo de UX;
  - ¿"Cancelar" vuelve a donde estaba?
- **Estados vacíos:** dicen qué hacer ("Registra el primero en…") y llevan a hacerlo.
- **Cargando:** el esqueleto se parece a lo que va a aparecer y no salta al cargar ([M] CLS).
- **Errores del servidor y de la red:** un mensaje en español, sin perder lo escrito.
- **WhatsApp:** los pasos para vincular se entienden sin leer el README. El código se puede copiar
  en el celular, y el estado "vinculado" deja claro qué número y cómo desvincularlo.
- **Administración:**
  - las acciones peligrosas (suspender, eliminar) se ven distintas y piden el código;
  - los filtros se entienden y se pueden quitar;
  - las listas largas tienen "Ver más".
- **Textos:**
  - español neutro con "tú", sin términos técnicos;
  - los mismos nombres para lo mismo: "egreso" en la web, "gasto" solo en ejemplos del bot;
  - etiquetas que dicen qué escribir; los placeholders son ejemplos, no etiquetas.
- **[M] Zonas táctiles** (mínimo 24 px; Apple recomienda 44):
  - los botones de cada fila (editar, eliminar, "⋯") son los más chicos y los más usados;
  - en tableta, lo que funciona con el mouse tiene que funcionar con el dedo: nada que solo aparezca
    al pasar el mouse.
- **Navegación:**
  - la pestaña actual se marca;
  - "Atrás" del navegador hace lo esperado;
  - después de una acción se queda en un lugar con sentido.

## 5. Accesibilidad (WCAG 2.2 A y AA)

| Criterio | Qué revisar | Cómo |
|---|---|---|
| 1.1.1 Contenido no textual | Íconos y emojis con nombre o `aria-hidden` | [M] axe |
| 1.3.1 Información y relaciones | Títulos en orden, listas como listas, etiquetas unidas a sus campos, errores con `aria-describedby` | [M] axe y estructura |
| 1.3.4 Orientación | Funciona en vertical y horizontal | Celular horizontal |
| 1.3.5 Propósito de los campos | `autoComplete` en nombre, correo, contraseña y código | Código |
| 1.4.1 Uso del color | El ingreso/egreso también con "+"/"−"; los errores también con texto | Capturas |
| 1.4.3 Contraste del texto | 4,5:1 (3:1 en texto grande), en claro y oscuro | [M] axe |
| 1.4.4 Cambio de tamaño del texto | Con la letra al 200 % nada se corta ni se tapa | [M] letra-200 |
| 1.4.10 Reflujo | A 320 px, sin scroll de lado | [M] reflujo-320 |
| 1.4.11 Contraste de lo que no es texto | El borde de los campos y de los controles contra el fondo: 3:1. Axe no lo mide | `src/color-contrast.test.ts` (tokens `--control`, `--brand`, `--danger`); un control nuevo con otro borde, a mano |
| 1.4.12 Espaciado del texto | Más interlineado y espacio entre letras no corta nada | Prueba corta con estilos |
| 1.4.13 Contenido al pasar el mouse | Los `title` y menús se pueden cerrar y no tapan lo que se lee | Código |
| 2.1.1 y 2.1.2 Teclado | Todo se hace con el teclado y se sale de cada ventana con Esc | [M] foco, y a mano en las ventanas |
| 2.4.3 Orden del foco | El orden de Tab sigue la lectura; al abrir una ventana el foco entra y al cerrarla vuelve al botón | [M] orden en `medidas.json`, y a mano |
| 2.4.6 Títulos y etiquetas | Dicen de qué trata cada sección o campo | Capturas |
| 2.4.7 Foco visible | Todo lo enfocable muestra el anillo | [M] foco |
| 2.4.11 Foco no tapado | Lo enfocado no queda debajo de algo fijo | [M] foco |
| 2.5.3 Etiqueta en el nombre | El nombre accesible empieza con el texto visible ("Editar Almuerzo" para un ícono de editar está bien) | axe y código |
| 2.5.8 Tamaño del objetivo | 24 × 24 px o con espacio libre | [M] tactil-chico |
| 3.2.2 Al ingresar datos | Elegir una opción no envía el formulario solo | Flujos |
| 3.3.1 y 3.3.3 Errores | Se dice cuál campo y cómo arreglarlo, en español, debajo del campo (CLAUDE.md → Formularios) | Flujos |
| 3.3.2 Etiquetas o instrucciones | Cada campo con etiqueta visible | Capturas |
| 3.3.7 Entrada redundante | No se pide dos veces lo mismo en un flujo | Flujos |
| 3.3.8 Autenticación accesible | Se puede pegar la contraseña y el código, y usar el gestor de contraseñas | Código (`autoComplete`, sin bloquear pegar) |
| 4.1.2 Nombre, función y valor | Botones, pestañas y menús con su rol y estado (`aria-current`, `aria-expanded`) | [M] axe y código |
| 4.1.3 Mensajes de estado | "✓ Registrado" y los errores se anuncian (`aria-live`, `role="alert"`) | Código |

Más allá de la WCAG:
- **`prefers-reduced-motion`:** las animaciones que se repiten (el esqueleto con `animate-pulse`)
  deberían ir con `motion-safe:`. Es una sugerencia.
- **Lector de pantalla:** una pasada corta con VoiceOver en la lista "Para revisar en tus
  dispositivos" del informe.

## 6. Rendimiento percibido

- **[M] Saltos al cargar (CLS):** menos de 0,1. Las fuentes con `next/font` y los esqueletos del
  tamaño de lo que reemplazan.
- **Respuesta al tocar:** los botones muestran que están trabajando ("Guardando…", `disabled`) y no
  se pueden enviar dos veces.
- **Mensajes que aparecen** (confirmaciones, errores) no empujan el resto: tienen su lugar reservado
  (`min-h-5`).

## 7. Para revisar en tus dispositivos (lista para el dueño, unos 5 minutos)

Va al final del informe, adaptada a lo que cambió:
1. En el iPhone: tocar cada campo de Ingresos y de "Nueva categoría". La página no hace zoom.
2. En el iPhone: elegir una fecha y una categoría con los selectores nativos.
3. En el iPad, vertical y horizontal: Resumen, Egresos y la administración. Todo se ve ordenado y
   se toca bien con el dedo.
4. Girar el celular en Egresos con el formulario a medio llenar.
5. VoiceOver (Ajustes → Accesibilidad) en el login y en Egresos: cada botón dice qué hace.
