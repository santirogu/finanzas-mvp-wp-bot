# Finanzas MVP — reglas del proyecto

App de finanzas personales (Next.js 16 + Postgres) con un bot de WhatsApp que interpreta mensajes
con Claude. Los detalles de stack, scripts y despliegue están en el [README](README.md).

Responde y escribe en **español** (commits, PRs, comentarios del código y textos de la app).

@AGENTS.md

## Flujo de trabajo con git (obligatorio)

1. **Todo cambio va en una rama nueva**, creada desde `main` actualizado
   (`git checkout main && git pull --ff-only && git checkout -b <rama>`). Nunca hagas commits en
   `main`: GitHub rechaza los pushes directos (regla "Proteger main", sin excepciones).
2. **Nombre de la rama:** `<tipo>/<descripcion-corta>`, en minúsculas, palabras separadas por
   guiones, sin tildes ni espacios. El CI rechaza los PRs que no cumplan este formato.

   | Tipo | Cuándo | Ejemplo |
   |---|---|---|
   | `feature/` | Funcionalidad nueva | `feature/notas-de-voz` |
   | `fix/` | Corrección de un bug | `fix/token-whatsapp-vencido` |
   | `hotfix/` | Arreglo urgente en producción | `hotfix/webhook-caido` |
   | `refactor/` | Reorganizar código sin cambiar comportamiento | `refactor/separar-interprete` |
   | `test/` | Solo pruebas | `test/webhook-route` |
   | `docs/` | Solo documentación | `docs/flujo-pull-requests` |
   | `chore/` | Dependencias, configuración, mantenimiento | `chore/actualizar-next` |
   | `ci/` | Cambios al pipeline de CI/CD | `ci/check-nombre-de-rama` |

   Si un cambio mezcla tipos, usa el del cambio principal (una funcionalidad con sus pruebas es
   `feature/`).
3. **Commits y título del PR con [Conventional Commits](https://www.conventionalcommits.org/es/):**

   ```
   <tipo>(<ámbito opcional>): <descripción en imperativo, minúscula inicial, sin punto final>

   <cuerpo opcional: el porqué del cambio>
   ```

   - Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf` (el de la rama:
     `feature/` → `feat`, `fix/` y `hotfix/` → `fix`, el resto igual).
   - Ámbitos sugeridos: `bot`, `whatsapp`, `web`, `auth`, `db`, `transacciones`, `deps`.
   - Máximo 72 caracteres en la primera línea. Un `!` antes de los dos puntos marca un cambio
     incompatible: `feat(auth)!: exigir verificación del correo`.
   - El tipo decide la versión de la release que se publica sola al desplegar
     (`scripts/release.mjs`): `feat` sube la menor, `!` la mayor, el resto el parche. Elige el
     tipo con cuidado y usa `!` solo si el cambio de verdad rompe algo para quien usa la app.
   - Ejemplos: `feat(bot): registrar gastos desde notas de voz`,
     `fix(whatsapp): ignorar saltos de línea en el token`, `docs: explicar el flujo de PRs`.
   - Los PRs se fusionan solo con **squash and merge**: el **título del PR** se vuelve el commit
     de `main`, y el check **Título del PR** lo valida. El hook `.githooks/commit-msg` (se activa
     con `pnpm install`) valida cada commit local con `scripts/conventional-commit.mjs`.
4. **Antes de abrir el PR**, en local, lo mismo que corre el CI: `pnpm lint`, `pnpm typecheck`,
   `pnpm db:check-drift` y **`pnpm test:coverage`** (unitarias + integración + umbral de cobertura;
   `pnpm test` solo no valida el umbral). Si cambias un componente de cliente, actualiza su
   prueba de componentes (`*.test.tsx`). Si cambiaste páginas o componentes, corre también
   `pnpm test:e2e` (el check "E2E y accesibilidad" es obligatorio). Si agregas código, agrégale pruebas. Si agregaste o cambiaste lógica en archivos
   que muta Stryker (`stryker.config.mjs`), ponle al PR la etiqueta `mutation-testing` (o corre
   `pnpm test:mutation:cambios` en local), cubre con pruebas los mutantes sobrevivientes relevantes y
   comunica el puntaje antes de que el dueño fusione. No es un check obligatorio: en un PR muta solo
   los archivos de la lista que cambió y los que agrega a ella (minutos); la lista completa (~8 horas) corre los lunes, en partes. Si cambiaste el prompt o el esquema del bot, propón correr `pnpm bot:eval` (cuesta
   créditos de la API: pide confirmación).
5. **Abre un Pull Request hacia `main`.** El título sigue el punto 3 (descripción en español) y
   la descripción sigue `.github/pull_request_template.md`: encabezados en inglés, contenido en
   español. El check **Descripción del PR** exige contenido real en las tres primeras:

   ```markdown
   ## Why
   Por qué hace falta el cambio (el problema o la motivación).

   ## What
   Qué cambia, en una lista corta.

   ## How
   Cómo se resolvió (enfoque, decisiones, alternativas descartadas) y cómo se probó.

   ## Additional Notes
   Opcional: riesgos, migraciones, pasos manuales tras el merge, capturas, deuda técnica.
   ```

   Si el PR lo abre Claude, termina con la línea "🤖 Generated with Claude Code".
6. **El merge lo hace el dueño del repositorio, a mano.** No fusiones PRs, no actives auto-merge
   ni pidas a ninguna herramienta que lo haga. Cuando el PR esté listo, avisa y espera.
7. Después del merge: `git checkout main && git pull --ff-only` y borra la rama local.

El merge a `main` dispara el CI y, solo si pasa y cambió algo que afecta la app (ver
`scripts/deploy-needed.mjs`), el despliegue a producción, incluidas las migraciones. La versión
nueva se publica sin dominio, pasa los smoke tests (`scripts/smoke.mjs`) y solo entonces recibe el
dominio; si falla después, vuelve sola a la anterior (README → Despliegue). Si sale bien, el job
`release` publica la release de GitHub con su tag (`v1.2.0`): no crees tags ni releases a mano ni
pongas la versión en `package.json`. Si agregas
archivos que no afectan la app en ejecución (docs, herramientas, configuración de desarrollo),
agrégalos a `SKIP_PATTERNS` en ese script con su prueba. Nada llega a producción por otro camino: no reactives los despliegues automáticos
de Vercel ni muevas las migraciones fuera del job `deploy`.

## Seguridad y datos

- Los PRs de **Dependabot** (`chore(deps): …`, `ci(deps): …`) también los fusiona el dueño. Si te
  pide revisarlos, verifica el changelog y que el CI pase; si una actualización mayor rompe algo,
  arréglalo en una rama `fix/` o `chore/` aparte.
- Si CodeQL marca una alerta en un PR, corrígela en el mismo PR antes de pedir el merge.
- **Auditoría de seguridad:** usa el skill `/auditoria-seguridad` (README → Seguridad).
  - Antes de abrir un PR que toque autenticación, roles, administración, el webhook, el bot, las
    cabeceras, las variables de entorno o los workflows, corre `/auditoria-seguridad cambios`.
  - Su informe va a `reports/seguridad/` y nunca se sube: el repo es público.
  - Los PRs de arreglo no describen cómo explotar el fallo hasta que esté desplegado.

- Nunca escribas secretos en el código, en commits ni en el chat; van en `.env` (local) o en
  Vercel. Si el usuario pega una credencial, recuérdale que no lo haga.
- Las pruebas de integración usan solo `TEST_DATABASE_URL` (base terminada en `_test`).
- Si cambias `src/db/schema/`, genera la migración en el mismo PR con
  `pnpm db:generate --name <descripcion>` y revisa el SQL antes de subirlo: el check de CI
  "Migraciones al día" falla si falta. Si `drizzle-kit` pregunta si una columna se renombró,
  responde con cuidado (un renombre conserva los datos; "crear" borra la columna vieja).
- **Migraciones compatibles con la versión anterior del código.** Corren en el build, antes de
  los smoke tests; si la versión nueva falla y el despliegue vuelve a la anterior, la base queda
  migrada. Agrega antes de quitar: para renombrar o borrar una columna o tabla, primero un PR que
  agregue lo nuevo (y el código que lo usa) y, en otro PR posterior, uno que quite lo viejo.
  Nunca renombres ni borres en el mismo PR que cambia el código que lo usa.
- `WHATSAPP_API_URL` y `ANTHROPIC_BASE_URL` solo existen para las E2E (servidores falsos) y la
  app solo las acepta si apuntan a `localhost` (`src/lib/service-url.ts`): con cada pedido viaja
  un token. No las configures en Vercel.
- Si la app empieza a usar recursos de otro dominio (scripts, fuentes, imágenes, una API desde el
  navegador), agrégalo a la CSP en `src/lib/security-headers.ts` con su prueba: si no, el navegador
  lo bloquea y las E2E fallan.
- Si agregas una variable de entorno obligatoria, súmala a `REQUIRED_ENV` en `src/lib/health.ts`
  (y configúrala en Vercel **antes** del merge, o el despliegue se detendrá en los smoke tests).
- **Roles** (`src/lib/roles.ts`, README → Roles): toda página, acción o consulta de administración
  usa `requireAdmin()` de `src/lib/session.ts` (rol + verificación en dos pasos) y se clasifica en
  `src/authorization-matrix.test.ts` (páginas: "requiere sesión de admin…"; acciones:
  "requireAdmin…"). `requireAdminRole()` (sin la verificación) es solo para `/admin/seguridad` y
  el marco `src/app/[lang]/(app)/admin/layout.tsx`.
  El rol de admin lo dan y lo quitan solo el super admin desde Usuarios (`requireSuperAdmin()`, con su
  código y registrado en `account_event`) o la terminal (`pnpm admin:grant` / `admin:revoke`), las dos
  con `src/modules/account/admin-role.ts`. La marca de super admin (una sola cuenta) solo la pone la
  terminal (`pnpm admin:super`): nunca desde la app, y nadie le quita el rol al super admin desde la
  app. Nunca vuelvas editables el rol ni la marca (`input: false` en Better Auth) ni crees usuarios o
  contraseñas de admin por defecto. Solo `roles.ts` y `session.ts` comparan roles. No reactives los
  endpoints de `TWO_FACTOR_DISABLED_PATHS` ni ofrezcas "recordar este dispositivo".
- **Rutas de Better Auth** (`src/modules/auth/http-routes.ts`): `/api/auth/*` solo atiende
  `AUTH_HTTP_ROUTES`; el resto responde 404.
  - Si el navegador necesita una ruta nueva de Better Auth, agrégala a `AUTH_HTTP_ROUTES` con quién la
    usa. Antes, piensa si basta llamar a `auth.api.*` desde una Server Action.
  - Si Better Auth trae un endpoint nuevo, clasifícalo: `src/lib/auth-routes.int.test.ts` falla hasta
    que lo hagas.
- **Agregar un módulo de administración** (README → Sección de administración):
  1. su entrada en `src/modules/admin/modules.ts` (`status: "activo"`);
  2. su página en `src/app/[lang]/(app)/admin/<id>/page.tsx`, que llama a `requireAdmin()` y se clasifica
     en la matriz de autorización como "requiere sesión de admin…";
  3. sus consultas en `src/modules/admin/<id>/`: cada función exportada es `async` y llama a
     `requireAdmin()` antes de tocar la base (la matriz lo verifica). Si es un listado, reutiliza
     `src/modules/admin/shared/` (filtros de la URL, fechas, formatos) y `ChipFilterBar` y
     `ActiveFilters` (`src/app/[lang]/(app)/admin/`);
  4. si el módulo cambia datos (usuarios, categorías, configuración…), sus Server Actions con
     `requireAdmin()`, confirmadas con el código de Google Authenticator (`confirmAdminCode` de
     `src/modules/admin/shared/confirm-code.ts`; nunca `auth.api.verifyTOTP`, que no limita intentos
     con la sesión abierta), y registradas en `account_event` con `adminId` en la misma transacción
     (auditoría: README → Usuarios). **Excepción decidida (#50):** en Categorías, crear, renombrar y
     restaurar no piden el código (archivar y eliminar sí) y su auditoría va en `category_change`
     (README → Seguridad → Riesgos aceptados). Una excepción nueva se decide con el dueño y se anota
     ahí;
  5. su resumen en la tarjeta de Inicio, si aplica, y pruebas unitarias, de integración, E2E y de
     accesibilidad.
- **Categorías** (README → Categorías): las globales las administra el admin; no las crees ni
  renombres en migraciones o en `scripts/seed.ts` (la semilla solo actúa en una base vacía). "Otros"
  es la de respaldo del bot y de las eliminadas: no la quites. En los formularios y el bot usa
  `listCategories` (sin archivadas); al validar una categoría, `isCategoryAvailable`.
- **Cuentas suspendidas** (README → Usuarios): no abren sesiones (hook de Better Auth),
  `getCurrentUser` ignora la que les quede y el bot no registra nada. Si agregas otra forma de
  entrar o de usar la app (otro proveedor de login, una API, un comando del bot), revisa
  `isSuspended` (`src/modules/account/suspension.ts`) también ahí, con su prueba.
- **Formularios**: si un campo tiene `required`, `minLength`, `pattern`, `type="email"` o `max`,
  el formulario usa `useFieldErrors` (`src/components/use-field-errors.ts`) con sus mensajes en
  español y muestra cada error debajo de su campo con `FieldError` (fuera del `<label>`, con
  `aria-invalid` y `aria-describedby`). Nunca el globo del navegador: `src/forms.test.ts` lo exige y
  las E2E fallan si aparece.
- **Celular y tableta**: los campos usan la clase `input` (16 px en pantallas táctiles: con menos,
  Safari del iPhone y del iPad hace zoom al tocarlos). Su letra chica va con `pointer-fine:` (solo con
  mouse), nunca con un corte de ancho (`sm:`): un iPad o un celular horizontal también son táctiles.
  Un `<select>` también usa `input`: va sin la apariencia del sistema (Safari en Mac le quitaba el
  borde y el alto) y con la flecha de `--select-arrow`; `src/global-styles.test.ts` lo revisa.
  Una rejilla con columnas solo desde un ancho (`lg:grid-cols-5`) lleva también `grid-cols-1`: sin
  eso, un texto largo la ensancha más que la pantalla. Si agregas una página, súmala a
  `e2e/diseno-tactil.spec.ts` y a las vistas de la auditoría de diseño
  (`.claude/skills/auditoria-diseno/recorrido/vistas.ts`).
- **Idiomas** (README → Idiomas): las páginas van en `src/app/[lang]/`; las direcciones no llevan el idioma
  (lo agrega el proxy por dentro). En un componente de cliente, la ruta actual se lee con `useAppPathname()`
  (`src/i18n/navigation.ts`), nunca con `usePathname()` (`src/i18n/guard.test.ts` lo revisa). Un texto nuevo en una página que ya tiene
  inglés va con `texts()` en los dos idiomas, nunca escrito solo en español; los montos y las fechas, con el
  idioma de la página (`formatMoney(…, locale)`). Una Server Action lee el idioma con `getRequestLocale()`
  (`src/i18n/request.ts`) y lo pasa a la función que arma el mensaje. `user.locale` solo lo cambia Mi
  cuenta (`saveLanguageAction`); la cookie `idioma`, Mi cuenta y el inicio de sesión (`src/lib/auth.ts`).
  Sin cookie, vale el idioma del navegador (`negotiateLocale`).
- **E2E que cambian algo de toda la app** (pausar Claude, los topes del bot, la configuración): van en
  `e2e/configuracion-*.spec.ts`, el proyecto "configuracion" de Playwright, que corre aparte (README →
  Pruebas y CI). En paralelo con las demás les cambiaría lo que responde el bot.
- **Auditoría de diseño:** usa el skill `/auditoria-diseno` (README → Pruebas y CI).
  - Antes de abrir un PR que cambie páginas, componentes, `globals.css` o el layout, corre
    `/auditoria-diseno cambios`.
  - Su informe y sus capturas van a `reports/diseno/` y no se suben.
- **Auditoría de pruebas:** usa el skill `/auditoria-pruebas` (README → Pruebas y CI).
  - Antes de abrir un PR que agregue o cambie lógica (módulos, Server Actions, rutas, componentes de
    cliente), corre `/auditoria-pruebas cambios`.
  - Una vez al mes, `/auditoria-pruebas completa`.
  - Su informe va a `reports/pruebas/` y no se sube.
- **Avisos emergentes** (README → Decisiones importantes): la confirmación de algo que ya pasó va con
  `useToast()` (`src/components/toaster.tsx`): `tone: "success"` (verde) si se guardó o se activó,
  `"removal"` (rojo) si se borró o se desactivó; con `focus: true` si lo que se tocó ya no está (una
  ventana que se cerró, una fila borrada). Después de una redirección del servidor, un código de
  `URL_TOASTS` (`src/lib/toasts.ts`, con sus páginas) en `?aviso=`, nunca datos de la persona. Los
  errores no van ahí: se quedan junto a su campo.
- **Colores** (`src/app/globals.css`): solo los tokens. Los errores, las alertas y lo que no se
  deshace van en rojo (`danger`, y `btn-danger` para su botón); el naranja (`expense`) es solo para
  los egresos (`src/forms.test.ts` lo revisa en los avisos con `role="alert"`). Los tokens `admin` (violeta) son solo
  para lo de administración (la pestaña, la etiqueta y el escudo). Los gráficos usan su paleta (`chart-1` a
  `chart-7` y `chart-rest`), no los colores con significado. El borde de un campo es `border-control` (3:1
  contra la tarjeta y el fondo, WCAG 1.4.11), nunca `border-border`, que es para divisores y tarjetas.
  Si cambias un color, `src/color-contrast.test.ts` revisa ese contraste (axe solo el del texto).
  El modo oscuro está en dos bloques iguales (el del sistema y el elegido en Mi cuenta, `src/lib/theme.ts`):
  cambia los dos (la prueba exige que coincidan) y nunca uses la variante `dark:` de Tailwind, que solo
  mira el sistema (`src/global-styles.test.ts` lo revisa).
- **Dinero**: siempre con `formatMoney` (`src/lib/money.ts`), que da "$1.000.000,00" (dos decimales,
  sin espacio) y "−$50.000,00" para los negativos (el signo menos tipográfico, U+2212, como el de los
  egresos en las listas), en la web y en el bot. No uses `toLocaleString` para mostrar montos, y un
  monto grande en pantalla va con `whitespace-nowrap` (que no se parta). Los montos
  tienen centavos (`numeric(18, 2)`): súmalos con `sumAmounts` (o en SQL) y redondea las restas con
  `roundToCents`. Un campo de monto lee con `parseAmountInput` y formatea
  con `formatAmountTyping` (punto = miles, coma = centavos).
- **Historial de la cuenta** (`account_event`, README → Historial de las cuentas): si agregas o cambias
  algo del registro o la vinculación de WhatsApp, registra su evento con `recordEvent` en la misma
  transacción, con su prueba.
- **Dependencias con scripts de instalación** (pnpm 10, `strict-dep-builds`): si al agregar una
  dependencia la instalación falla por sus scripts, revisa si funciona sin ellos. Si sí, va en
  `pnpm.ignoredBuiltDependencies`; si de verdad los necesita, en `pnpm.onlyBuiltDependencies`. En los
  dos casos, con su porqué en el README (Versiones forzadas de dependencias). No desactives
  `strict-dep-builds` ni `minimum-release-age` (`.npmrc`).
- **Logs sin datos personales:** nunca pases un error crudo a `console.*`; usa `describeError`
  (`src/lib/safe-log.ts`), porque el mensaje de un error de la base trae los datos de la consulta.
  `src/logs.test.ts` lo exige. Tampoco loguees textos de mensajes, correos ni montos.
- **Retención:** si agregas datos que la política promete borrar con el tiempo, súmalos a
  `runDailyCleanup` (`src/modules/account/retention.ts`) con su prueba, y actualiza `/privacidad`.
- Para borrar una cuenta a pedido usa `pnpm account:delete <correo>` (README → Borrar datos a
  pedido), nunca SQL a mano. Si agregas una tabla con datos de la persona sin clave foránea en
  cascada hacia `user`, bórrala también en `deleteAccountData` (`src/modules/account/`).
- Toda consulta o Server Action filtra por el usuario de la sesión (`src/lib/session.ts`). Si
  agregas una página, una ruta de API o una Server Action, clasifícala en
  `src/authorization-matrix.test.ts` (la prueba falla hasta que lo hagas) y prueba en integración,
  con dos usuarios, que no expone ni modifica datos ajenos.
