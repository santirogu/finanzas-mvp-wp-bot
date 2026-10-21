---
name: auditoria-textos
description: Auditoría de los textos que ve la persona en Finanzas MVP (pantallas, botones, errores, avisos, aria-label y alt, mensajes del bot de WhatsApp, el PDF, las páginas legales), en español según la RAE y en inglés. Revisa ortografía, gramática, puntuación, expresiones censuradas, redundancias, textos largos, claridad, el glosario de la app y que el inglés diga lo mismo que el español. Úsala cuando se pida revisar la ortografía, la redacción o el tono, corregir textos, revisar un cambio de textos antes de un PR o repasar los pendientes de una auditoría de textos anterior. Modos — completa (por defecto), cambios (la rama actual frente a main, o un PR) o un área (es, en, bot, legal, admin, errores) o una página (/egresos).
argument-hint: "[completa | cambios [n.º de PR] | <área> | <página>]"
---

# Auditoría de textos

Revisa cómo está escrito lo que la persona lee en la app y en el bot. Verifica cada hallazgo con su
regla y su fuente, y entrega un informe priorizado. Responde en español. Modo pedido: `$ARGUMENTS`
(vacío = `completa`).

Combina dos cosas:
- **Lo mecánico:** el inventario (`textos.mjs`) junta todos los textos con su archivo:línea y su idioma,
  y marca lo que se puede detectar sin criterio: tildes que faltan o sobran, signos sin pareja,
  comillas rectas, el % pegado a la cifra, frases largas, palabras repetidas, expresiones censuradas,
  claves de `texts()` cuyo inglés no tiene los mismos datos que el español.
- **Lo que pide criterio:** leer cada texto en su contexto, con [checklist.md](checklist.md) y el
  [glosario](glosario.md). La concordancia, el sentido, la claridad, la redundancia entre un título y su
  descripción o un inglés que suena traducido no los detecta ningún script.

## Reglas de la auditoría (no negociables)

1. **Solo lectura.** Durante la auditoría no cambies textos, código ni pruebas. Los arreglos van
   después, en ramas `fix/…` (un tema por rama), siguiendo CLAUDE.md, y **solo si la persona lo
   confirma**.
2. **Lo que lee Claude queda fuera:** el prompt del bot (`src/modules/bot/prompt.ts`), la descripción
   de su herramienta (`claude-extractor.ts`) y las evaluaciones (`src/modules/bot/eval/`). Cambiarlos
   cambia lo que entiende el bot y pide `pnpm bot:eval`, que cuesta créditos. Si ves un error ahí,
   anótalo como observación, sin proponer el cambio.
3. **Las páginas legales dicen lo que la app promete.** Un arreglo de forma (una tilde, una coma, una
   frase más corta que dice lo mismo) va como cualquier otro. Un cambio de contenido (qué se guarda,
   cuánto tiempo, quién lo ve) es un hallazgo aparte, para que lo decida el dueño, y cambia la fecha
   de actualización (`LEGAL_UPDATED_AT`).
4. **No cambies el sentido.** Una corrección dice lo mismo con mejor forma. Si un texto es ambiguo o
   dice algo que la app no hace, es un hallazgo de contenido: se describe y se propone, no se
   "corrige" en silencio.
5. **El informe no se sube**: va a `reports/textos/AAAA-MM-DD-<modo>/` (`/reports` está en
   `.gitignore`), junto con los textos que extrae el inventario. Los hallazgos de textos no son
   sensibles: los PRs de arreglo los describen sin problema.
6. **Cada hallazgo se verifica** (paso 4) con su regla y su fuente (el DLE, el DPD, la Ortografía o la
   Gramática de la RAE, la FundéuRAE, el glosario), y con el texto armado tal como se ve. Sin regla, es
   **Sugerencia**: va aparte y nunca bloquea un PR.

## Paso 1. Preparación

- Lee el [glosario](glosario.md): el trato (tú), las palabras de la app en los dos idiomas, cómo se
  escriben los montos, las fechas y los signos, y las decisiones ya tomadas. Lo que el glosario
  decidió no es un hallazgo, aunque otra fuente lo haga distinto.
- Lee en CLAUDE.md **Idiomas** y **Dinero**, y en el README la sección **Idiomas** (qué está solo en
  español por decisión: el bot y las páginas legales).
- Busca el informe anterior: `ls -t reports/textos/ 2>/dev/null | head -3`. Si hay, lee su
  `informe.md`: sus pendientes se revisan primero y el informe nuevo dice cuáles se resolvieron.
- Fija el alcance según el modo:
  - `completa`: todos los textos, en los dos idiomas.
  - `cambios`: `git diff main...HEAD` (o `gh pr diff <n.º>`). Revisa los textos que cambiaron o se
    agregaron, en los dos idiomas, y los que dependen de ellos: si cambió el nombre de un botón, la
    Ayuda, el bot o la política que lo nombran tienen que decir lo mismo (`grep -rn "<nombre viejo>"
    src`).
  - Un área:
    - `es`: el español de la web;
    - `en`: el inglés de la web, frente a su español;
    - `bot`: los mensajes de WhatsApp (`src/modules/bot/`, `src/modules/whatsapp/`);
    - `legal`: `/privacidad` y `/eliminar-datos`;
    - `admin`: las páginas y mensajes de administración;
    - `errores`: los errores de los formularios y de las acciones, y los avisos.
  - Una página (`/egresos`): sus archivos en `src/app/[lang]/` y los componentes que usa.

## Paso 2. Inventario automático

```bash
node .claude/skills/auditoria-textos/textos.mjs --salida reports/textos/AAAA-MM-DD-<modo>
node .claude/skills/auditoria-textos/textos.mjs cambios --salida reports/textos/AAAA-MM-DD-cambios
```

Tarda un segundo y solo lee archivos. Deja en la carpeta:
- `marcas.md`, lo mismo que muestra en la consola. **Empieza por aquí.**
  - **Marcas por tipo:** ortografía, puntuación, espacios, expresión, glosario, repetición, largo,
    mayúsculas, traducción.
  - **Español e inglés:** las claves de `texts()` cuyo inglés tiene otros datos, otro signo al
    final, otras negritas u otros emojis, o quedó igual al español.
  - **Español sin su inglés:** textos fuera de `texts()` y de un `{ es, en }` en páginas que tienen
    inglés.
  - **Variantes del glosario:** cuántas veces se usa cada forma ("eliminar" o "borrar") y dónde,
    las de la minoría.
- `textos-es.md` y `textos-en.md`: todos los textos, por archivo, con su línea y su tipo (título,
  botón, atributo, texto). Los de JSX salen armados, con las etiquetas de dentro de la frase
  (`<strong>`, `<Link>`) y cada dato como `{nombre}`. Es lo que leen los subagentes.

Qué saber de las marcas:
- **Una marca no es un hallazgo.** Las de expresión, repetición y largo son pistas: "realizar" puede
  estar bien, "mes a mes" no es redundancia y una frase de 32 palabras en la política puede ser clara.
- El idioma de un texto fuera de `texts()` se deduce y puede fallar. En `textos-*.md` esos textos
  dicen "idioma deducido".
- Un texto partido en dos (`"¿Quisiste decir"` + un enlace + `"?"`) marca los signos sin pareja:
  míralo armado antes de decidir.

## Paso 3. Lectura con criterio

Recorre [checklist.md](checklist.md) en las áreas del alcance. Lee los textos completos y en orden,
como los lee la persona: en `textos-*.md` y, para entender cómo se arman, en el código. Para cada
posible hallazgo anota:
- archivo:línea;
- el texto actual;
- qué está mal y la regla (con su fuente);
- la propuesta, en los dos idiomas si cambia el sentido;
- una severidad tentativa (escala en [plantilla-informe.md](plantilla-informe.md)).

En modo `completa`, reparte la lectura en **subagentes en paralelo** (tipo `general-purpose`, con la
instrucción de no editar nada), por ejemplo:

- el español de la web (`textos-es.md` sin el bot ni las páginas legales);
- el inglés de la web (`textos-en.md`, comparado con su español);
- el bot, el PDF y las páginas legales.

Pásale a cada uno:
- la ruta de su parte de `textos-*.md`;
- las secciones del checklist que le tocan y el glosario completo;
- las reglas 1, 2, 4 y 6 de arriba;
- las marcas del inventario de su parte, para que las confirme o las descarte.

Pídele posibles hallazgos con los datos de la lista de arriba, y sugerencias aparte, sin arreglos. Tú
haces la verificación.

## Paso 4. Verificación

Para cada posible hallazgo (del inventario, de los subagentes o tuyo):

1. **Míralo armado.** Abre el archivo y mira cómo se completa el texto:
   - qué datos entran (un nombre, un mes, un monto, un número que puede ser 1);
   - qué va antes y después (otro texto, un enlace, un ícono);
   - si cambia con el plural o el género.

   Si hace falta verlo en pantalla, renderízalo:
   - una prueba de componentes que ya lo muestre;
   - la página en el servidor de desarrollo (preview), con una cuenta de prueba creada en la sesión;
   - para el bot, `src/modules/bot/replies.test.ts` arma los mensajes completos.
2. **Confirma la regla en su fuente:**
   - **Español:** el DLE (dle.rae.es), el Diccionario panhispánico de dudas, la Ortografía de 2010 o
     la FundéuRAE.
   - **Inglés:** Merriam-Webster y la guía de estilo de Microsoft (Microsoft Writing Style Guide),
     que es la referencia para interfaces.

   Si consultas en línea, solo lee páginas públicas. Muchas "reglas" de la escuela no lo son: "de
   acuerdo a" está aceptado, y "solo" ya no lleva tilde.
3. **Clasifícalo:**
   - **CONFIRMADO**: lo dice una norma o el glosario, y el texto armado lo muestra;
   - **PROBABLE**: depende de algo que no se pudo ver (un dato que en producción podría venir vacío,
     cómo lo lee un lector de pantalla);
   - **descartado**: no entra al informe. Anota en una línea por qué, para no volver a revisarlo: lo
     acepta el DPD, es un nombre propio, el glosario lo decidió o es un estilo a propósito.
4. **Ajusta la severidad** con dónde se ve y a quién confunde: un error en el inicio de sesión o en
   una respuesta del bot lo ve todo el mundo; uno en una página del admin, muy pocos.

## Paso 5. Informe

- Escribe `reports/textos/AAAA-MM-DD-<modo>/informe.md` con [plantilla-informe.md](plantilla-informe.md).
- En el chat, muestra:
  - un resumen corto y lo que está bien;
  - los hallazgos por severidad, con archivo:línea, el texto actual y el propuesto;
  - las sugerencias, aparte;
  - las decisiones que el glosario todavía no tomó;
  - lo que se resolvió desde la auditoría anterior;
  - la ruta del informe.
- Termina proponiendo el plan de arreglos:
  - una rama `fix/…` por tema: la ortografía, el inglés, el bot, las páginas legales;
  - primero lo crítico y lo alto;
  - para cada una, qué pruebas nombran los textos que cambian: un texto nuevo rompe las pruebas que
    lo buscan (`getByText`, `getByRole(…, { name })`, las respuestas del bot). Búscalas con
    `grep -rn "<texto viejo>" src e2e test` y cámbialas en el mismo PR;
  - si cambian páginas o componentes, las E2E y `/auditoria-diseno cambios`: un texto más largo puede
    no caber, sobre todo en español.

  Pregunta antes de empezar cualquiera. Si un hallazgo pide una decisión de estilo (el % con
  espacio, los títulos con punto), proponla para el glosario en vez de cambiar los textos.

## Cuándo usar cada modo

- `cambios`: antes de abrir un PR que agregue o cambie textos que ve la persona (páginas,
  componentes, errores, avisos, el bot, el PDF o las páginas legales).
- `completa`: una vez al mes, después de una funcionalidad grande o antes de mostrarle la app a
  alguien nuevo.
- Un área o una página: cuando haya una duda concreta ("¿el inglés de Reportes suena natural?").

## Mantenimiento

- Si la app agrega otro lugar con textos (correos, otro canal del bot), súmalo a `textos.mjs`; si
  agrega textos que solo lee Claude u otro programa, a `OUT_OF_SCOPE`.
- Una palabra que se decide (en una auditoría o en un PR) va al glosario, y su variante descartada a
  `VARIANTS` y a las reglas de `textos.mjs`, para que la próxima auditoría la marque sola.
- Una marca que da falsos positivos se corrige en `textos.mjs`, con un comentario del caso.
