# Checklist de la auditoría de pruebas

Cada área dice qué mirar y dónde. Los nombres de área son los que acepta el skill como argumento.
Si un archivo cambió de lugar, búscalo antes de dar el punto por bueno o por malo, y actualiza este
checklist en el PR del arreglo.

**La pregunta de fondo, en cada punto:** si alguien rompe esto mañana, ¿qué prueba falla, y su
mensaje dice qué se rompió?

**Decisiones ya tomadas** (no son hallazgos nuevos):
- Los componentes (`*.tsx`) no se mutan con Stryker: casi todo su código son clases y textos
  (comentario de `stryker.config.mjs`).
- Las páginas del servidor (`page.tsx`, `layout.tsx`) no entran en la cobertura: se prueban con las
  E2E (comentario de `vitest.config.mts`).
- Lo que depende de la base (consultas, Server Actions) se prueba en integración y puede quedar
  fuera de Stryker.
- La matriz de autorización no corre en Stryker (lee el código instrumentado).
- La corrida completa de Stryker es solo los lunes (unas 8 horas).

Si alguna de estas ya no se sostiene (por ejemplo, una página empieza a tener lógica propia),
propón revisarla; no la reportes como un fallo.

## cobertura — Qué se mide y qué no

Archivos: `vitest.config.mts` (`coverage.include`, `exclude`, `thresholds`) y
`coverage/coverage-summary.json` (después de `pnpm test:coverage`).

- **Lo que no se mide:** el inventario lista el código fuera de `coverage.include`.
  - Un componente de cliente o un módulo con lógica fuera de la lista es un hallazgo, aunque tenga
    prueba: su cobertura no cuenta para el umbral y puede bajar sin que nadie lo note.
  - La lista de componentes está escrita a mano (`{auth-form,…}.tsx`). Si se repite, propón un patrón
    que no dependa de acordarse, por ejemplo todos los `.tsx` con `"use client"` o una prueba que
    falle si uno queda fuera.
- **Lo que se mide de rebote:** un archivo medido que ninguna prueba importa solo se recorre desde
  otro.
  - Puede estar bien (un esquema de la base que se usa en todas las pruebas de integración).
  - O puede esconder lógica que nadie revisa directo: mira qué hace y si sus casos borde se prueban.
- **Bajo el umbral:** archivos con menos de 85 % de líneas o 80 % de ramas. Mira qué líneas faltan
  (`coverage/index.html`): un `catch`, un caso de error, una rama de configuración.
- **El umbral global:** `thresholds` es un piso. Si la cobertura real está muy por encima (más de 10
  puntos), propón subirlo para que una baja grande falle en el CI.
- **La cobertura no es calidad:** una línea cubierta por una prueba sin aserción útil cuenta igual.
  Por eso existe la mutación.

## unitarias — Lógica pura

Archivos: `src/lib/**`, `src/modules/**` (lo que no usa la base), `scripts/*.mjs`, y sus
`*.test.ts` al lado.

- **Aserciones que revisan el valor:**
  - `toEqual` con el resultado esperado, no `toBeDefined()` o `toBeTruthy()` (pasan con casi
    cualquier cosa);
  - una prueba que solo revisa que "no lanza" no prueba qué devuelve.
- **Casos borde de este dominio:**
  - **Dinero:**
    - centavos (`0,1 + 0,2`);
    - negativos con el signo menos tipográfico (U+2212);
    - el monto máximo (`MAX_AMOUNT` de `src/lib/money.ts`, el límite que usa la validación);
    - "punto = miles, coma = centavos" en `parseAmountInput`.
  - **Fechas:**
    - la zona horaria de la persona (`todayInTimezone`), con un reloj fijo en la prueba;
    - el 31 de un mes de 30 días, febrero y los bisiestos;
    - diciembre → enero.
  - **Textos:** tildes, mayúsculas y espacios de más (`searchKey`, las descripciones de los gastos
    fijos).
  - **Vacío y uno solo:** sin movimientos, un solo mes, un solo día, empates.
- **Pruebas que dependen de la hora real:** una prueba que usa `new Date()` sin fijarla puede fallar
  a fin de mes, a medianoche o el 29 de febrero. Busca `new Date()` y `Date.now()` en las pruebas y en
  el código que prueban sin un reloj inyectado.
- **Datos al azar:** el inventario lista las pruebas con `Math.random` o `randomInt`. Revisa que ninguna
  aserción dependa de lo que sale: una búsqueda de "100%_nadie" fallaba 1 de cada 200 corridas porque
  también buscaba "100" en un número al azar. Mejor datos fijos, o aserciones que no los toquen.
- **Una prueba por comportamiento:** el nombre en español dice la regla ("si empatan, el primero de
  la semana"). Si un nombre dice "funciona" o "caso 3", no se sabe qué protege.

## integracion — Contra la base

Archivos: `*.int.test.ts`, `test/integration/` (`factories.ts`, `setup.ts`, `global-setup.ts`),
`src/authorization-matrix.test.ts`, `src/modules/account/delete-account.int.test.ts`.

- **Dos usuarios:** cada consulta, Server Action y ruta prueba que no lee ni cambia datos de otra
  cuenta (CLAUDE.md). El inventario lista las que ningún `*.int.test.ts` nombra. Para las que sí,
  revisa que la prueba de verdad cree una segunda cuenta con datos y compruebe que no aparecen o no
  cambian.
- **Sin sesión:** cada Server Action prueba que sin sesión lleva al login (la sesión se simula con
  `vi.mock("@/lib/session")`).
- **Lo que no se guarda:** con una entrada inválida, la prueba revisa que la base quedó igual, no
  solo el mensaje de error.
- **Borrar una cuenta:** cada tabla con datos de la persona aparece en los conteos de
  `delete-account.int.test.ts`, antes y después (el inventario lista las que faltan). Una tabla sin
  cascada se borra en `deleteAccountData`, con su prueba.
- **Retención:** lo que `/privacidad` promete borrar con el tiempo está en `runDailyCleanup`, con una
  prueba del plazo exacto (un día antes no se borra, el día se borra).
- **Las restricciones de la base:** los `CHECK` y los índices únicos tienen una prueba que intenta
  violarlos (la base es la última defensa si el código falla).
- **Independencia:** cada prueba crea sus datos con las factories y no depende de lo que dejó otra
  (corren un archivo a la vez, pero el orden dentro del archivo no debería importar).
- **Listas en orden:** una lista leída de la base que se compara en orden (`toEqual([a, b])`) lleva
  `orderBy`.
  - Sin `ORDER BY`, Postgres devuelve las filas en el orden en que quedaron en la tabla, y no siempre
    es el de llegada.
  - El pool tiene varias conexiones, y después de un `Promise.all` las consultas siguientes van rotando
    entre ellas: cada una guarda en la página que tiene a mano.
  - Falla muy de vez en cuando, con la base cargada (le pasó a "pausar y reanudar Claude").
  - Si el orden no importa, `.sort()` o `expect.arrayContaining`.

## componentes — React Testing Library

Archivos: `src/**/*.test.tsx`, `test/components-setup.ts`, `test/toaster.tsx`.

- **Cada componente de cliente tiene su prueba** (CLAUDE.md: "si cambias un componente de cliente,
  actualiza su prueba"). El inventario marca los que no tienen `*.test.tsx` al lado.
- **Se busca como un lector de pantalla:** por rol y nombre accesible (`getByRole("button", { name })`),
  no por clases ni `querySelector`. Una prueba que busca por clase no se entera si el botón pierde su
  nombre.
- **Lo que ve y oye la persona:** el aviso emergente (`findToast`), el error debajo de su campo
  (`aria-invalid`, `aria-describedby`), el foco después de una acción (`toHaveFocus`).
- **Estados:** mientras se envía (botón desactivado, "Guardando…"), con error del servidor, vacío.
- **Las acciones del servidor se simulan** y la prueba revisa con qué se llamaron (el `FormData`),
  no solo que se llamaron.
- **jsdom no es un navegador:** no hace layout, ni `checkVisibility`, ni CSS real. Lo que depende de
  eso (que algo quepa, que se vea) va en las E2E o en la auditoría de diseño, no aquí.

## e2e — Playwright

Archivos: `e2e/*.spec.ts`, `e2e/helpers.ts`, `e2e/admin.ts`, `e2e/whatsapp.ts`,
`e2e/fake-services.mjs`, `playwright.config.ts`.

- **Esperas fijas:** `waitForTimeout` y `setTimeout` en una E2E son lentas y frágiles. Si la espera
  es necesaria (probar que algo **no** pasa durante un tiempo), tiene que estar explicada en un
  comentario.
- **Estado global compartido:** las pruebas que cambian algo de toda la app van en
  `e2e/configuracion-*.spec.ts` (CLAUDE.md).
  - Si una cae a mitad de camino, ¿deja la configuración cambiada para la siguiente?
  - Que la restauración vaya en un `beforeEach` o `afterEach`, no solo al final de la prueba.
- **Conexiones que se cierran:** "socket hang up" o `ECONNRESET` en el CI. El servidor falso y
  `next start` no cierran las conexiones inactivas (`keepAliveTimeout`), y `sendWhatsApp` y `sentTo`
  reintentan (`maxRetries`). Un pedido nuevo con `request` que no pase por ellos y vuelva a consultar
  después de varios segundos de interfaz, revísalo.
- **axe:** las páginas nuevas pasan axe en claro y oscuro, con datos.
  - axe se pasa sin avisos emergentes animándose: mide el contraste a medio camino y da falsos
    positivos.
- **Cobertura de páginas:**
  - cada página está en `e2e/diseno-tactil.spec.ts` y en las vistas de la auditoría de diseño (el
    inventario lista las que faltan);
  - las páginas públicas (`/cuenta-eliminada`, `/eliminar-datos`) también.
- **Selectores:** por rol y nombre, con `visible()` (Next deja montadas las páginas visitadas). Un
  selector por texto parcial que coincide con dos cosas falla en modo estricto o, peor, toca la
  equivocada.
- **Lo que solo una E2E puede probar:** el flujo completo con el navegador real (la redirección, la
  cookie, el JavaScript apagado). Lo que una prueba unitaria puede probar no debería depender solo de
  una E2E: es más lenta y su error dice menos.

## mutacion — Stryker

Archivos: `stryker.config.mjs` (`mutate`, `thresholds`), `scripts/mutation-targets.mjs`,
`.github/workflows/mutation.yml`, `reports/mutation/mutation.json`.

- **Sobrevivientes:** cada mutante que sobrevive es un error que ninguna prueba detecta.
  - **Que importa:** falta una prueba (hallazgo).
  - **Equivalente:** no cambia el resultado, y se anota con `// Stryker disable next-line <Mutador>:
    <por qué>`. Un sobreviviente sin prueba ni anotación es un hallazgo.
- **Anotaciones vencidas:** un `Stryker disable` cuyo porqué ya no es cierto (el código cambió) esconde
  un error posible. Revisa que cada una siga siendo equivalente.
- **Lo que no se muta:** el inventario lista la lógica de `src/lib` y `src/modules` fuera de
  `mutate`. Si un archivo es lógica pura (no usa la base) y no está en la lista, propón agregarlo.
- **Timeouts:** muchos mutantes en "Timeout" en un archivo suelen ser bucles. Cuentan como
  detectados, pero si la corrida tarda de más, se nota en el CI de los lunes.
- **El puntaje de los lunes:** el resumen del último run de *Mutation testing* en `main`. Si bajó
  del umbral `break`, ¿qué archivo lo bajó?

## ci — El pipeline y la salud de las pruebas

Archivos: `.github/workflows/ci.yml`, `mutation.yml`, `scripts/e2e-needed.mjs`,
`scripts/deploy-needed.mjs`, `test/e2e-en-ci.test.ts`.

- **Intermitencia:**
  - las pruebas "flaky" (pasaron al reintento) en los últimos 30 runs de `main` y de los PRs;
  - los jobs que fallaron y pasaron al relanzarlos sin cambios.

  Una intermitencia que se repite es un hallazgo aunque el CI quede verde: algún día falla dos
  veces seguidas y frena un despliegue.
- **Checks obligatorios:** lint, tipos, `test:coverage` (con el umbral), drift, E2E, ZAP. ¿Alguno se
  salta en un caso que debería correr? `e2e-needed.mjs` decide cuándo saltar las E2E: revisa que un
  archivo nuevo de la app no caiga en sus patrones de "no hace falta".
- **Tiempos:** cuánto tardan los jobs de pruebas y si crecieron mucho desde la auditoría anterior.
  Las pruebas más lentas (paso 2) son candidatas a revisar.
- **Lo que solo corre en local:** `pnpm bot:eval` (cuesta créditos) y la auditoría de diseño. Que esté
  dicho en el README.

## reglas — Lo que promete CLAUDE.md

Revisa que cada regla con una prueba detrás la tenga y que la prueba la haga cumplir de verdad (que
falle si alguien la rompe):

| Regla | Dónde se exige |
|---|---|
| Formularios con `useFieldErrors`, sin el globo del navegador | `src/forms.test.ts`, fixture `nativeValidation` de las E2E |
| Campos con la clase `input`; `<select>` sin la apariencia del sistema | `src/global-styles.test.ts`, `e2e/diseno-tactil.spec.ts` |
| Colores: contraste de bordes, avisos, tonos del calendario | `src/color-contrast.test.ts` |
| Logs sin datos personales (`describeError`) | `src/logs.test.ts` |
| Cada página, ruta y Server Action clasificada | `src/authorization-matrix.test.ts` |
| Rutas de Better Auth solo las de `AUTH_HTTP_ROUTES` | `src/lib/auth-routes.int.test.ts` |
| Cada proyecto de Playwright en una parte del CI | `test/e2e-en-ci.test.ts` |
| Variables de entorno obligatorias en `REQUIRED_ENV` | `src/lib/health.ts` y su prueba |
| Esquema y migraciones al día | `pnpm db:check-drift` |

Si encuentras una regla de CLAUDE.md sin prueba que la sostenga, propón la prueba (no la regla nueva).
