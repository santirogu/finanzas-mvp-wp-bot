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
3. **Antes de abrir el PR**, en local: `pnpm lint`, `pnpm typecheck`, `pnpm test` y, si tocaste
   algo que usa la base de datos, `pnpm test:int`. Si cambiaste el prompt o el esquema del bot,
   propón correr `pnpm bot:eval` (cuesta créditos de la API: pide confirmación).
4. **Abre un Pull Request hacia `main`** con un resumen de qué cambia y cómo se probó.
5. **El merge lo hace el dueño del repositorio, a mano.** No fusiones PRs, no actives auto-merge
   ni pidas a ninguna herramienta que lo haga. Cuando el PR esté listo, avisa y espera.
6. Después del merge: `git checkout main && git pull --ff-only` y borra la rama local.

El merge a `main` dispara el CI y, solo si pasa, el despliegue a producción (incluidas las
migraciones). Nada llega a producción por otro camino: no reactives los despliegues automáticos
de Vercel ni muevas las migraciones fuera del job `deploy`.

## Seguridad y datos

- Nunca escribas secretos en el código, en commits ni en el chat; van en `.env` (local) o en
  Vercel. Si el usuario pega una credencial, recuérdale que no lo haga.
- Las pruebas de integración usan solo `TEST_DATABASE_URL` (base terminada en `_test`).
- Toda consulta o Server Action filtra por el usuario de la sesión (`src/lib/session.ts`).
