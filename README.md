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
| `pnpm test` | Pruebas unitarias y de componentes (rápidas, sin base de datos) |
| `pnpm test:int` | Pruebas de integración contra Postgres real (`TEST_DATABASE_URL`) |
| `pnpm test:coverage` | Todas las pruebas + reporte de cobertura en `coverage/` |
| `pnpm test:e2e` | Pruebas E2E y de accesibilidad con Playwright (compila la app; ~1 minuto). `E2E_SKIP_BUILD=1` reutiliza el último build |
| `pnpm test:mutation` | Mutation testing con Stryker; reporte en `reports/mutation/` (~8 minutos) |
| `pnpm smoke <url>` | Smoke tests contra una versión publicada (lo corre el despliegue; ver abajo) |
| `pnpm db:generate` | Genera una migración SQL tras cambiar `src/db/schema/*` |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm db:check-drift` | Verifica que cada cambio del esquema tenga su migración (lo corre el CI) |
| `pnpm db:seed` | Inserta categorías globales (idempotente) |
| `pnpm db:studio` | Explorador visual de la base de datos |
| `pnpm bot:try 'texto'` | Muestra cómo interpreta el bot un mensaje (usa la API de Claude). Usa comillas simples si el texto tiene `$` |
| `pnpm bot:eval` | Corre el set de ~50 frases de prueba del bot y reporta aciertos, latencia y costo |

> No uses `pnpm setup` (es un comando propio de pnpm que modifica tu shell). El script del proyecto se llama `db:setup`.

## Pruebas y CI

- **Unitarias** (`*.test.ts`): lógica pura — dinero, fechas, intérprete del bot, firma y payload
  de WhatsApp. No necesitan base de datos.
- **Componentes** (`*.test.tsx`, [React Testing Library](https://testing-library.com/react) en
  jsdom): los componentes de cliente por separado — formulario de login y registro (errores,
  sugerencia de correo, envío por POST), formulario de movimientos (formato del monto, errores,
  botón desactivado mientras guarda), lista de movimientos, pestañas y la tarjeta para conectar
  WhatsApp (cuenta regresiva y vencimiento del código, con reloj simulado). Se buscan los
  elementos por rol y etiqueta, como un lector de pantalla.
- **Integración** (`*.int.test.ts`): contra un Postgres real en la base `finanzas_test`, que se
  borra y migra al inicio de cada corrida (nunca uses una base que no termine en `_test`). Cubren el
  flujo completo del bot (vincular, registrar, duplicados, deshacer, errores), las consultas del
  balance y las Server Actions, incluido que un usuario no pueda ver ni borrar datos de otro.
  Claude y WhatsApp se simulan: no cuestan dinero.
- **E2E y accesibilidad** (`e2e/`, `pnpm test:e2e`, [Playwright](https://playwright.dev)): un
  navegador real recorre la app como un usuario contra un build de producción local, con su propia
  base (`finanzas_e2e_test`): registro, login, ingresos, egresos, balance, borrar y salir (también
  en tamaño de celular), errores del formulario, el límite de intentos de login y que dos usuarios
  no vean los datos del otro. [axe-core](https://github.com/dequelabs/axe-core) revisa cada página
  (WCAG 2.1 A y AA) y falla ante problemas graves. Sin Claude ni WhatsApp: no cuesta nada. La
  primera vez instala el navegador: `pnpm exec playwright install chromium`.
- **Matriz de autorización** (`src/authorization-matrix.test.ts`): inventario de todas las
  páginas, rutas de API y Server Actions con la protección de cada una. Falla si aparece una entrada
  sin clasificar, una Server Action que no llama a `requireUser()` antes de tocar datos, o una página
  privada que solo depende del proxy. El aislamiento entre usuarios de cada entrada se prueba en
  integración con dos usuarios, y `src/proxy.test.ts` cubre cada redirección con y sin sesión.
- **Schema drift** (`pnpm db:check-drift`): falla si `src/db/schema/` cambió sin su migración en
  `drizzle/`, mostrando el SQL pendiente, o si `drizzle-kit` necesita una decisión (p. ej. ante un
  renombre de columna). No necesita base de datos y deja `drizzle/` intacto.
- **CI** (`.github/workflows/ci.yml`): en cada push a `main` y en cada PR corre lint, tipos y todas
  las pruebas con un Postgres efímero. Falla si la cobertura baja del umbral de `vitest.config.mts`.
- **Mutation testing** (`pnpm test:mutation`, [StrykerJS](https://stryker-mutator.io)): introduce
  cambios pequeños en la lógica (cambia `>` por `>=`, borra condiciones, vacía textos) y verifica que
  alguna prueba unitaria falle. El puntaje es el % de mutantes detectados (~95 %; lo que sobrevive
  son mutantes equivalentes, que no cambian el comportamiento). Muta `src/lib`, los módulos del bot,
  WhatsApp y transacciones, el webhook y los scripts del CI. El reporte HTML queda en
  `reports/mutation/index.html`. Tarda ~8 minutos en local y ~40 en GitHub (cada mutante corre la
  suite unitaria completa), así que corre **a pedido**: en un PR al ponerle la etiqueta
  `mutation-testing`, con *Actions → Mutation testing → Run workflow*, y **cada lunes** sobre `main`.
  Falla si el puntaje baja del umbral `break` de `stryker.config.mjs`, pero no bloquea el merge.
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

## Seguridad

Resumen de lo que se revisa de forma automática (detalles y cómo reportar en [SECURITY.md](SECURITY.md)):

| Herramienta | Qué hace | Cuándo | ¿Bloquea? |
|---|---|---|---|
| **CodeQL** (`.github/workflows/codeql.yml`) | Análisis estático del código TypeScript y de los workflows (reglas `security-extended`) | Cada PR, cada push a `main` y los miércoles | Sí: el merge se bloquea si un PR agrega alertas altas o críticas |
| **`pnpm audit`** (job de CI) | Vulnerabilidades conocidas en dependencias de producción | Cada PR y push | Sí, si son altas o críticas |
| **Dependabot** (`.github/dependabot.yml`) | Alertas y PRs de seguridad, y actualizaciones semanales agrupadas | Lunes y ante cada vulnerabilidad nueva | No: abre PRs que el dueño revisa y fusiona |
| **Secret scanning + push protection** | Detecta credenciales en el repo y **rechaza pushes** que las contengan | Siempre | Sí |
| **OWASP ZAP** (job `dast` del CI) | Escaneo dinámico pasivo del build de producción: cabeceras faltantes, cookies inseguras, fugas de información. Reglas en `.zap/rules.tsv` (FAIL bloquea; WARN aceptadas con su porqué) | Cada PR y push | Sí, ante reglas en FAIL; el despliegue también lo espera |

**Cabeceras de seguridad** (`src/lib/security-headers.ts`, aplicadas en `next.config.ts` a todas las
rutas): Content-Security-Policy (solo recursos propios, sin iframes ni plugins), HSTS,
X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy y
Cross-Origin-Opener/Resource-Policy; sin `X-Powered-By`. La CSP permite scripts en línea
(`'unsafe-inline'`) porque los nonces no son compatibles con el prerenderizado parcial que usa la
app (guía de CSP de Next 16). Las E2E fallan si la CSP bloquea algo de la app, y los smoke tests
revisan las cabeceras en cada despliegue.

**Límite de intentos (contra fuerza bruta):** Better Auth permite 3 intentos de login o registro
cada 10 segundos por IP (y 100 pedidos cada 10 s en el resto de `/api/auth`); después responde 429
y el formulario pide esperar. El contador se guarda en Postgres (tabla `rate_limit`), así que lo
respetan todas las instancias de Vercel; en memoria cada instancia tendría el suyo. La IP sale de
`x-forwarded-for`, que Vercel reemplaza con la IP real del cliente. Lo prueban
`src/lib/rate-limit.int.test.ts` y las E2E. La vinculación de WhatsApp tiene su propio límite: 5
códigos fallidos por hora y número.

**Bloqueo por cuenta:** el límite por IP no frena a quien reparte los intentos entre muchas IPs.
Por eso, tras 5 contraseñas equivocadas en 15 minutos, la cuenta queda bloqueada 15 minutos, venga
el intento de donde venga (ni la contraseña correcta entra; el formulario dice cuánto falta). Se
cuenta por correo, también para correos que no existen, así que no revela cuáles están registrados.
Un login correcto reinicia el contador. Implementado con hooks de Better Auth
(`src/lib/auth.ts`) y la tabla `login_failure` (`src/modules/auth/lockout.ts`). Contra: alguien
podría bloquear a propósito la cuenta de otra persona; por eso el bloqueo es corto.

### Versiones forzadas de dependencias

`package.json → pnpm.overrides` fuerza versiones corregidas en dependencias indirectas cuyo paquete
padre todavía no se actualiza. Revísalas cuando se actualicen esos paquetes y bórralas si ya no
hacen falta:

| Override | Por qué | Quitar cuando |
|---|---|---|
| `@esbuild-kit/core-utils>esbuild: ^0.25.4` | `drizzle-kit` 0.31 trae `esbuild` 0.18, vulnerable ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)). Verificado: `drizzle-kit generate`, `check` y `migrate` siguen funcionando | `drizzle-kit` deje de depender de `@esbuild-kit` |
| `typed-rest-client>qs: ^6.16.0` | Stryker 10.0.0 usa `typed-rest-client` 2.x con `qs` vulnerable (3 avisos de DoS) | Stryker actualice `typed-rest-client` a 3.x |

Única vulnerabilidad conocida restante: `braces` (alta, vía ESLint, solo desarrollo), sin versión
corregida publicada.

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
pasaron. Ese job ejecuta `pnpm vercel-build` (migraciones + categorías + build), así que tampoco
una migración rota llega a la base de producción.

**Cada versión se prueba antes de recibir tráfico** (smoke tests, `scripts/smoke.mjs`):

1. Se publica **sin dominio** (`vercel deploy --prebuilt --prod --skip-domain`): queda en su propia
   URL y los usuarios siguen en la versión anterior.
2. Smoke tests contra esa URL. Si fallan, el job se detiene: el dominio nunca cambió.
3. Se le pasa el dominio (`vercel promote`, instantáneo, sin recompilar).
4. Smoke tests contra el dominio real. Si fallan, **vuelve sola a la versión anterior**
   (`vercel rollback`) y el job queda en rojo.

Los chequeos (segundos, sin costo, sin iniciar sesión ni guardar datos): `/login`, `/privacidad` y
`/eliminar-datos` cargan; `/api/health` confirma la conexión a la base, que tiene todas las
migraciones y que no falta ninguna variable de entorno (responde solo `ok`/`error`; el detalle
queda en los logs de Vercel); y el webhook rechaza un token y una firma falsos. Para correrlos a
mano: `pnpm smoke https://finanzas-mvp-wp-bot.vercel.app`.

> **Las migraciones no se deshacen con el rollback**: corren en el build, antes de los smoke tests.
> Por eso deben ser compatibles con la versión anterior del código (ver CLAUDE.md).

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
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel → proyecto → Settings → Deployment Protection → Protection Bypass for Automation. Deja entrar a los smoke tests a la URL propia de cada versión, que Vercel protege |

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

## Licencia

Copyright (c) 2026 Santiago Rodriguez Gutierrez. **Todos los derechos reservados.**

Este repositorio es público solo para consulta. No se permite usar, copiar, modificar, distribuir
ni ofrecer el software como servicio sin autorización previa y por escrito del titular. Consulta
los términos completos en [LICENSE](LICENSE). Para solicitar permisos: santiagorock000@gmail.com.
