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
   `pnpm test:mutation` en local), cubre con pruebas los mutantes sobrevivientes relevantes y
   comunica el puntaje antes de que el dueño fusione. No es un check obligatorio: tarda ~40 minutos en GitHub. Si cambiaste el prompt o el esquema del bot, propón correr `pnpm bot:eval` (cuesta
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
  usa `requireAdmin()` de `src/lib/session.ts` y se clasifica en `src/authorization-matrix.test.ts`
  (páginas: "requiere sesión de admin…"; acciones: "requireAdmin…"). El rol solo cambia con
  `pnpm admin:grant` / `admin:revoke`: nunca lo vuelvas editable (`input: false` en Better Auth) ni
  crees usuarios o contraseñas de admin por defecto. Solo `roles.ts` y `session.ts` comparan roles.
- Para borrar una cuenta a pedido usa `pnpm account:delete <correo>` (README → Borrar datos a
  pedido), nunca SQL a mano. Si agregas una tabla con datos de la persona sin clave foránea en
  cascada hacia `user`, bórrala también en `deleteAccountData` (`src/modules/account/`).
- Toda consulta o Server Action filtra por el usuario de la sesión (`src/lib/session.ts`). Si
  agregas una página, una ruta de API o una Server Action, clasifícala en
  `src/authorization-matrix.test.ts` (la prueba falla hasta que lo hagas) y prueba en integración,
  con dos usuarios, que no expone ni modifica datos ajenos.
