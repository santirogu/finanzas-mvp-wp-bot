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
   - Ejemplos: `feat(bot): registrar gastos desde notas de voz`,
     `fix(whatsapp): ignorar saltos de línea en el token`, `docs: explicar el flujo de PRs`.
   - Los PRs se fusionan solo con **squash and merge**: el **título del PR** se vuelve el commit
     de `main`, y el check **Título del PR** lo valida. El hook `.githooks/commit-msg` (se activa
     con `pnpm install`) valida cada commit local con `scripts/conventional-commit.mjs`.
4. **Antes de abrir el PR**, en local: `pnpm lint`, `pnpm typecheck`, `pnpm test` y, si tocaste
   algo que usa la base de datos, `pnpm test:int`. Si cambiaste el prompt o el esquema del bot,
   propón correr `pnpm bot:eval` (cuesta créditos de la API: pide confirmación).
5. **Abre un Pull Request hacia `main`** con un resumen de qué cambia y cómo se probó.
6. **El merge lo hace el dueño del repositorio, a mano.** No fusiones PRs, no actives auto-merge
   ni pidas a ninguna herramienta que lo haga. Cuando el PR esté listo, avisa y espera.
7. Después del merge: `git checkout main && git pull --ff-only` y borra la rama local.

El merge a `main` dispara el CI y, solo si pasa, el despliegue a producción (incluidas las
migraciones). Nada llega a producción por otro camino: no reactives los despliegues automáticos
de Vercel ni muevas las migraciones fuera del job `deploy`.

## Seguridad y datos

- Nunca escribas secretos en el código, en commits ni en el chat; van en `.env` (local) o en
  Vercel. Si el usuario pega una credencial, recuérdale que no lo haga.
- Las pruebas de integración usan solo `TEST_DATABASE_URL` (base terminada en `_test`).
- Toda consulta o Server Action filtra por el usuario de la sesión (`src/lib/session.ts`).
