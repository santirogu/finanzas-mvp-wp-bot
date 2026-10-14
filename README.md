# Finanzas MVP + Bot de WhatsApp

App web para registrar ingresos y egresos y ver el balance del mes actual. Cada usuario tiene
su propia sesión y su dashboard con tres pestañas: **Resumen**, **Ingresos** y **Egresos**.
Próximamente: registrar movimientos escribiéndole a un bot de WhatsApp
("me compré unos zapatos de $500.000").

## Stack

| Capa | Tecnología |
|---|---|
| App (frontend + backend) | Next.js 16 (App Router, Cache Components, Server Actions) + TypeScript |
| Estilos | Tailwind CSS 4 |
| Base de datos | PostgreSQL + Drizzle ORM (migraciones en `drizzle/`) |
| Autenticación | Better Auth: email + contraseña, sesión en cookie httpOnly |
| Validación | Zod (compartida entre el formulario web y el futuro bot) |
| Pruebas | Vitest |

## Desarrollo local

Requisitos: Node 22+, pnpm y Docker (o cualquier Postgres).

```bash
pnpm install
cp .env.example .env            # completa BETTER_AUTH_SECRET con: openssl rand -base64 32
pnpm db:up                      # levanta Postgres con Docker
pnpm db:setup                   # aplica migraciones y crea las categorías por defecto
pnpm dev                        # http://localhost:3000
```

### Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` / `build` / `start` | Servidor de desarrollo / build de producción / servir build |
| `pnpm typecheck` · `lint` | Tipos y ESLint |
| `pnpm test` | Pruebas unitarias (rápidas, sin base de datos) |
| `pnpm test:int` | Pruebas de integración contra Postgres real (`TEST_DATABASE_URL`) |
| `pnpm test:coverage` | Todas las pruebas + reporte de cobertura en `coverage/` |
| `pnpm db:generate` | Genera una migración SQL tras cambiar `src/db/schema/*` |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm db:seed` | Inserta categorías globales (idempotente) |
| `pnpm db:studio` | Explorador visual de la base de datos |
| `pnpm bot:try 'texto'` | Muestra cómo interpreta el bot un mensaje (usa la API de Claude). Usa comillas simples si el texto tiene `$` |
| `pnpm bot:eval` | Corre el set de ~50 frases de prueba del bot y reporta aciertos, latencia y costo |

> No uses `pnpm setup` (es un comando propio de pnpm que modifica tu shell). El script del proyecto se llama `db:setup`.

## Pruebas y CI

- **Unitarias** (`*.test.ts`): lógica pura — dinero, fechas, intérprete del bot, firma y payload
  de WhatsApp. No necesitan base de datos.
- **Integración** (`*.int.test.ts`): contra un Postgres real en la base `finanzas_test`, que se
  borra y migra al inicio de cada corrida (nunca uses una base que no termine en `_test`). Cubren el
  flujo completo del bot (vincular, registrar, duplicados, deshacer, errores), las consultas del
  balance y las Server Actions, incluido que un usuario no pueda ver ni borrar datos de otro.
  Claude y WhatsApp se simulan: no cuestan dinero.
- **CI** (`.github/workflows/ci.yml`): en cada push a `main` y en cada PR corre lint, tipos y todas
  las pruebas con un Postgres efímero. Falla si la cobertura baja del umbral de `vitest.config.mts`.
- **Evaluación del bot** (`pnpm bot:eval`): 50 frases contra la API real de Claude. Tiene costo,
  por eso no corre en CI.

Con Docker, `pnpm db:up` crea también la base `finanzas_test` la primera vez.

## Estructura

```
src/
  app/
    (auth)/login, (auth)/registro   Páginas públicas de acceso
    (app)/dashboard                 Resumen: balance del mes, últimos movimientos, gastos por categoría
    (app)/ingresos, (app)/egresos   Formulario + listado del mes (vista compartida)
    api/auth/[...all]               Endpoints de Better Auth
  db/schema/                        Tablas: auth (user, session…) y finanzas (category, transaction)
  lib/
    auth.ts, session.ts             Config de auth y Data Access Layer (único lugar que lee la sesión)
    money.ts, dates.ts              Formato/parsing de COP y "mes actual" según zona horaria
  modules/transactions/             Consultas, Server Actions y validación de movimientos
  modules/bot/                      Intérprete de mensajes (comandos fijos + Claude + validación) y flujo completo
  modules/whatsapp/                 Webhook: firma, payload, envío de mensajes y vinculación de números
  app/api/whatsapp/webhook          Endpoint que recibe los mensajes de Meta
  app/(app)/simulador               Chat de prueba del bot (solo en desarrollo)
  proxy.ts                          Redirecciones rápidas según haya cookie de sesión
scripts/seed.ts                     Categorías por defecto
```

### Decisiones importantes

- **Montos como enteros (`bigint`)** en la unidad mínima de la moneda; nunca `float`.
- **"Mes actual" según la zona horaria del usuario** (`America/Bogota` por defecto), para que un
  gasto del 31 a las 10 p. m. no caiga en el mes siguiente por usar UTC.
- **Todas las consultas filtran por `userId`** obtenido de la sesión en el servidor; cada Server
  Action vuelve a validar la sesión.
- **Borrado lógico** (`deleted_at`): permite un futuro "deshacer" desde WhatsApp.
- **`transaction.external_id` único**: guardará el ID del mensaje de WhatsApp para no registrar
  dos veces el mismo gasto si Meta reenvía el webhook.

## Bot de WhatsApp

1. En el dashboard, la tarjeta **WhatsApp → Conectar WhatsApp** genera un código de 6 dígitos
   (vence en 10 minutos). El usuario lo envía al bot como `VINCULAR 123456` y su número queda
   asociado a su cuenta.
2. Cada mensaje llega a `POST /api/whatsapp/webhook`. Se verifica la firma `X-Hub-Signature-256`,
   se responde 200 de inmediato y el mensaje se procesa después (`after()`).
3. Se deduplica por el ID del mensaje, se resuelven los comandos fijos (`balance`, `deshacer`,
   `ayuda`) y el texto libre se interpreta con Claude. El bot responde por WhatsApp.

En desarrollo, sin credenciales de Meta, las respuestas se imprimen en la consola. Para probar sin
WhatsApp, usa el simulador en `/simulador`.

## Flujo de trabajo

`main` está protegida: **no acepta pushes directos**, solo Pull Requests con el CI en verde
(regla "Proteger main" en *Settings → Rules*, sin excepciones, ni siquiera para administradores).
Las ramas siguen la convención `<tipo>/<descripcion-corta>` (`feature/`, `fix/`, `hotfix/`,
`refactor/`, `test/`, `docs/`, `chore/`, `ci/`), validada por el check **Nombre de rama**.
Los commits y títulos de PR siguen **Conventional Commits** (`feat(bot): …`, `fix: …`), validados
por el check **Título del PR** y por un hook local de git. La descripción del PR sigue la plantilla
`.github/pull_request_template.md` (**Why / What / How** y *Additional Notes* opcional), validada
por el check **Descripción del PR**. Los PRs se fusionan solo con *squash and
merge*. Las reglas completas están en [CLAUDE.md](CLAUDE.md).

```bash
git checkout -b feature/mi-cambio  # 1. trabaja en una rama
git push -u origin feature/mi-cambio  # 2. súbela
gh pr create --fill                # 3. abre el PR: el CI corre lint, tipos y pruebas
```

4. Cuando los checks estén en verde, revisa el PR en GitHub y haz clic en **Squash and merge**.
   La fusión es siempre manual: el auto-merge está desactivado en el repositorio.

Al fusionarse, el CI vuelve a correr sobre `main` y, si pasa, despliega a producción. La rama se
borra automáticamente. El PR debe estar al día con `main` antes de fusionarse.

## Despliegue (bloqueado por el CI)

**Nada llega a producción sin pasar el CI.** Vercel no despliega por su cuenta
(`vercel.json` → `git.deploymentEnabled: false`); lo hace el job `deploy` de
`.github/workflows/ci.yml`, que solo corre en `main` y solo si lint, tipos y todas las pruebas
pasaron. Ese job ejecuta `pnpm vercel-build` (migraciones + categorías + build) y publica con
`vercel deploy --prebuilt --prod`. Así, tampoco una migración rota llega a la base de producción.

**Solo se despliega si cambió algo que afecta la app.** El job `changes` compara `main` con el
**último commit desplegado con éxito** (no con el anterior, para no perder cambios de un despliegue
fallido) y `scripts/deploy-needed.mjs` decide: si todos los archivos cambiados son documentación,
workflows, pruebas o herramientas de desarrollo, no despliega; cualquier otro archivo, incluido uno
nuevo o desconocido, despliega. La decisión queda explicada en el resumen de cada corrida.

**Despliegue manual:** *Actions → CI → Run workflow* (rama `main`) corre los checks y despliega
siempre. Úsalo después de cambiar variables de entorno en Vercel.

Secretos necesarios en GitHub (*Settings → Secrets and variables → Actions*):

| Secreto | De dónde sale |
|---|---|
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens |
| `VERCEL_ORG_ID` | Vercel → Team Settings → General → Team ID (`team_…`) |
| `VERCEL_PROJECT_ID` | Vercel → proyecto → Settings → General → Project ID (`prj_…`) |

Variables de la app en Vercel (*Settings → Environment Variables*): `DATABASE_URL` y
`DATABASE_URL_UNPOOLED` (las crea Neon), `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY` y las
`WHATSAPP_*` de `.env.example`. `BETTER_AUTH_URL` solo hace falta con dominio propio.

Webhook en Meta: `https://<tu-app>.vercel.app/api/whatsapp/webhook`, el mismo
`WHATSAPP_VERIFY_TOKEN` y suscripción al campo `messages`. La cuenta de WhatsApp Business debe
estar suscrita a la app: `scripts/meta-subscribe.sh <WABA_ID> <APP_ID>`.

## Roadmap

- [x] **Fase 1:** auth por sesión, dashboard con balance del mes, pestañas de ingresos y egresos.
- [x] **Fase 2: bot de WhatsApp.** Webhook (firma, idempotencia), vinculación del número desde el
      dashboard, interpretación con Claude (salida estructurada), comandos `balance` / `deshacer`
      y simulador local.
- [ ] Conectar un número real de WhatsApp y publicar en Vercel.
- [ ] **Fase 3:** rate limiting, Sentry, CI, política de privacidad y salida a producción en Meta.
