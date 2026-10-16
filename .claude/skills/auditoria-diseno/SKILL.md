---
name: auditoria-diseno
description: Auditoría de diseño, renderizado, responsividad, UX, UI y accesibilidad de Finanzas MVP en celular, tableta (iPad) y computador, en Chromium y WebKit (Safari), en modo claro y oscuro. Úsala cuando se pida auditar el diseño, cómo se ve la app en un dispositivo, la experiencia de uso o la accesibilidad, revisar un cambio de páginas o componentes antes de un PR, o repasar los pendientes de una auditoría de diseño anterior. Modos — completa (por defecto), cambios (la rama actual frente a main, o un PR) o un área (celular, tableta, computador, accesibilidad, ux, ui) o una página (/egresos).
argument-hint: "[completa | cambios [n.º de PR] | <área> | <ruta>]"
---

# Auditoría de diseño

Revisa cómo se ve y cómo se usa la app en cada pantalla, verifica cada hallazgo y entrega un
informe priorizado con capturas. Responde en español. Modo pedido: `$ARGUMENTS` (vacío = `completa`).

Combina dos cosas:
- **Medidas automáticas** (el recorrido de `recorrido/`): lo que se puede medir es un defecto
  objetivo y, al arreglarlo, se vuelve una prueba E2E para que no vuelva a pasar.
- **Revisión visual y de uso** (tú y tus subagentes mirando capturas y recorriendo flujos): lo que es
  criterio de diseño va como **Sugerencia**, separado de los defectos, y nunca bloquea un PR.

## Reglas de la auditoría (no negociables)

1. **Solo lectura.** Durante la auditoría no cambies código, estilos ni la base. Los arreglos van
   después, cada uno en su rama `fix/…` (o `feature/…` si es un rediseño), con su prueba de
   regresión cuando se pueda medir, siguiendo CLAUDE.md, y **solo si la persona lo confirma**.
2. **Solo en local y con datos de prueba.** El recorrido usa el build de producción local, la base
   de las E2E (`finanzas_e2e_test`, que se borra al empezar) y los servidores falsos de WhatsApp y
   Claude: no cuesta nada ni toca datos reales. De producción, como mucho capturas de páginas
   públicas (`GET` de `/`, `/login`, `/privacidad`). Nunca abras la app con la cuenta de alguien.
3. **No corras el recorrido a la vez que `pnpm test:e2e`**: usan la misma base y el mismo puerto (3100).
4. **Descargas y costos, con permiso.** WebKit de Playwright ya está aprobado (solo en local). Para
   cualquier otra descarga (un runtime de iOS, otra herramienta), pregunta antes con nombre, origen
   y tamaño.
5. **El informe no se sube**: va a `reports/diseno/AAAA-MM-DD-<modo>/` (`/reports` está en
   `.gitignore`), porque pesa (capturas) y es de trabajo. Los hallazgos de diseño no son sensibles:
   los PRs de arreglo los pueden describir sin problema.
6. **Cada hallazgo se verifica** (paso 6) con una captura y una medida, o con archivo:línea. Sin
   evidencia no es un hallazgo. Lo subjetivo es Sugerencia.

## Paso 1. Preparación

- Lee en CLAUDE.md las reglas que la app promete: **Formularios**, **Celular**, **Dinero**; y en
  `src/app/globals.css`, los colores (tokens) y la clase `input`. Una regla prometida que no se
  cumple es un hallazgo.
- Busca el informe anterior: `ls -t reports/diseno/ 2>/dev/null | head -3`. Si hay, lee su
  `informe.md`: sus pendientes se revisan primero y el informe nuevo dice cuáles se resolvieron.
- Fija el alcance según el modo:
  - `completa`: todas las vistas, todos los grupos y los dos motores.
  - `cambios`: `git diff main...HEAD --stat` (o `gh pr diff <n.º>`). Por cada página o componente
    que cambió, busca qué rutas lo usan (`grep -rn "<Componente>" src/app`) y elige sus vistas en
    `recorrido/vistas.ts` (`AUDITORIA_VISTAS`). Si cambió `globals.css` o el layout, son todas.
  - Un grupo (`celular`, `tableta`, `computador`, `accesibilidad`): `AUDITORIA_GRUPOS=<grupo>`.
  - `ux` o `ui`: el recorrido de las vistas de los flujos (paso 5) y esa sección del checklist.
  - Una ruta (`/egresos`): las vistas de esa ruta.
- Si la app tiene una página que no está en `recorrido/vistas.ts`, anótalo como hallazgo de la
  auditoría (falta cubrirla) y agrégala en el PR del arreglo.

## Paso 2. Recorrido automático

1. ¿Está WebKit? `ls ~/Library/Caches/ms-playwright | grep webkit` y compáralo con
   `pnpm exec playwright install --dry-run webkit` (la versión que pide). Si falta, instálalo con
   `pnpm exec playwright install webkit` (aprobado; avisa el tamaño). Si no se puede, corre solo
   `--project chromium` y anótalo.
2. Compila sin la caché de Turbopack (a veces deja el CSS anterior):
   `rm -rf .next/cache/turbopack && pnpm exec next build`.
3. Corre el recorrido **en segundo plano** (unos 5 minutos el completo, con los dos motores):

   ```bash
   E2E_SKIP_BUILD=1 AUDITORIA_SALIDA=reports/diseno/AAAA-MM-DD-<modo> \
     pnpm exec playwright test -c .claude/skills/auditoria-diseno/recorrido/playwright.config.ts
   ```

   Filtros: `AUDITORIA_VISTAS=egresos,resumen` · `AUDITORIA_GRUPOS=celular,tableta` ·
   `--project chromium` o `--project webkit`.
4. Deja en la carpeta de salida:
   - `capturas/<motor>/<vista>/<dispositivo>-<claro|oscuro>.jpg`;
   - `medidas.json` (todo) y `resumen.txt` (los problemas agrupados entre vistas, dispositivos y
     motores: **empieza por aquí**);
   - `galeria.html`: las capturas lado a lado, con filtros por motor, modo y "solo con defectos".
     Se abre con doble clic, sin servidor. Dile a la persona dónde está.

Qué mide (detalles en `recorrido/medir.ts`):
- lo que se sale de la pantalla y el scroll de lado; el texto que se sale de su caja (un monto que
  no cabe en su tarjeta); lo que queda tapado;
- textos cortados (sin "…" es defecto; con "…" es informativo, para que el revisor juzgue);
- campos de menos de 16 px en pantallas táctiles (Safari hace zoom), y campos de una misma fila con
  altos distintos (el `<select>` de Safari en Mac, si pierde `appearance-none`);
- zonas táctiles: menos de 24 px pegadas a otra (WCAG 2.5.8) y menos de 44 px (Apple);
- estructura: `lang`, un h1, saltos de nivel en los títulos, `<main>`;
- axe con WCAG 2.2 A y AA y sus buenas prácticas, en modo claro y oscuro (en las pantallas
  representativas: 393, 820 y 1280 px);
- el recorrido con Tab en el computador (orden, indicador visible y foco tapado);
- los saltos al cargar (CLS, solo Chromium) y los errores de la consola.

## Paso 3. Revisión de las medidas

- Lee `resumen.txt`. Cada grupo ya junta el mismo problema en todas sus vistas y dispositivos.
- Para cada defecto, busca la causa en el código (la clase del elemento te lleva al componente).
  Un mismo arreglo suele resolver varios grupos: júntalos en un solo hallazgo.
- Los avisos de 44 px y los informativos no son hallazgos uno por uno: resúmelos (por ejemplo,
  "los botones de la lista miden 28 px en celular").
- Si una vista no se pudo recorrer, revisa su captura `-error.jpg`: puede ser un defecto real de la
  app o un cambio de la página que el recorrido no conoce (arréglalo en `vistas.ts` en el PR del
  skill, no durante la auditoría).

## Paso 4. Revisión visual (subagentes)

Lanza un subagente por grupo (celular, tableta, computador) **en paralelo**, de tipo `Explore`
(solo lectura), con:
- la sección **UI** y **Responsividad** de [checklist.md](checklist.md);
- las rutas de las capturas de su grupo: la pantalla representativa en claro y oscuro de cada
  vista, más las del grupo donde las medidas marcaron defectos (no le pases todas: con unas 40
  capturas por grupo alcanza);
- las reglas 1, 2 y 6 de arriba.

Pídele una lista de posibles hallazgos con: vista, dispositivo, captura, qué se ve mal, por qué
(el punto del checklist) y si es defecto o sugerencia. Sin arreglos. Tú verificas (paso 6).

## Paso 5. Flujos de UX y accesibilidad a mano

Con [checklist.md](checklist.md) (secciones **UX** y **Accesibilidad**), recorre los flujos y lee
su código:
- registrarse e iniciar sesión (con un error y con los dos pasos del admin);
- registrar, editar y borrar un movimiento; conectar y desvincular WhatsApp;
- las acciones del admin (crear, archivar y eliminar categorías; suspender una cuenta).

Para verlos funcionando, usa las capturas del recorrido y el código. Si hace falta interactuar
(un menú, el teclado, un lector de pantalla), escribe una prueba corta con los helpers de `e2e/`
en `e2e/zz-auditoria.spec.ts`, córrela con `E2E_SKIP_BUILD=1 pnpm test:e2e e2e/zz-auditoria.spec.ts`
y bórrala al terminar (no se sube: guárdala en el scratchpad por si sirve para el PR del arreglo).

### Simulador de iOS (opcional)

Es el Safari real del iPhone y del iPad: lo único que ve el zoom al tocar un campo, los selectores
de fecha, la barra de Safari y el notch.
- ¿Está disponible?
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl list devices available`.
  Si dice que falta aceptar la licencia de Xcode, la persona tiene que correr
  `sudo xcodebuild -license` (con su contraseña: tú no). Si no hay runtime de iOS, se descarga
  desde Xcode (varios GB): pregunta antes.
- Si no está, no insistas: en el informe va "no se pudo revisar en el simulador" y la lista de
  "Para revisar en tus dispositivos".
- Si está: con el servidor del recorrido corriendo, abre `http://localhost:3100` en un iPhone y un
  iPad con la herramienta del simulador, entra con una cuenta de prueba creada en esta sesión
  (la contraseña de las E2E, `e2e/helpers.ts`) y revisa la sección **Safari de iOS** del checklist.

## Paso 6. Verificación

Para cada posible hallazgo (de las medidas, de los subagentes o tuyo):
1. Míralo en la captura y en el código: ¿pasa de verdad? ¿En qué dispositivos y motores?
2. Si una medida puede ser un falso positivo (un elemento oculto, una excepción de la WCAG),
   compruébalo en la captura o con una prueba corta.
3. Clasifícalo:
   - **CONFIRMADO**: se ve en la captura o lo demuestra la medida y el código;
   - **PROBABLE**: el camino existe pero solo se puede confirmar en un dispositivo real
     (por ejemplo, el zoom de Safari en un iPad);
   - **descartado**: no entra al informe. Anota en una línea por qué, para no volver a revisarlo.
4. Ajusta la severidad (escala en [plantilla-informe.md](plantilla-informe.md)) al impacto real: a
   quién afecta y cuánto.

## Paso 7. Informe

- Escribe `reports/diseno/AAAA-MM-DD-<modo>/informe.md` con
  [plantilla-informe.md](plantilla-informe.md), con enlaces relativos a las capturas.
- En el chat, muestra:
  - un resumen corto y lo que está bien;
  - los hallazgos por severidad, con dónde se ve y el arreglo propuesto;
  - las sugerencias, aparte;
  - lo que se resolvió desde la auditoría anterior;
  - la ruta del informe y de la galería.
- Termina proponiendo el plan de arreglos: una rama por hallazgo o por grupo pequeño del mismo
  tema, primero lo bloqueante y lo alto, y para cada uno la prueba de regresión
  (`e2e/diseno-tactil.spec.ts`, axe en `e2e/accesibilidad.spec.ts` o una prueba de componente).
  Pregunta antes de empezar cualquiera. Si un hallazgo pide cambiar una regla de CLAUDE.md o el
  diseño en general, proponlo en vez de hacerlo.

## Cuándo usar cada modo

- `cambios`: antes de abrir un PR que cambie páginas, componentes, `globals.css` o el layout.
- `completa`: una vez al mes, después de una funcionalidad grande o un rediseño, o cuando cambie la
  versión de Next, Tailwind o los navegadores de Playwright.
- Un área o una página: cuando haya una queja concreta ("en el iPad se ve raro").

## Mantenimiento del recorrido

- Página nueva en la app → su vista en `recorrido/vistas.ts` (y en `e2e/diseno-tactil.spec.ts`).
- Dispositivo nuevo que importe (otro tamaño de iPhone o de iPad) → `recorrido/dispositivos.ts` y
  [dispositivos.md](dispositivos.md).
- Una medida que da falsos positivos → corrígela en `recorrido/medir.ts` con un comentario del caso.
