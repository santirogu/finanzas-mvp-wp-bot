# Finanzas MVP + Bot de WhatsApp

App web para registrar ingresos y egresos y ver el balance del mes actual. Cada usuario tiene
su propia sesión y su dashboard con tres pestañas: **Resumen**, **Ingresos** y **Egresos**, donde
cada movimiento se puede editar o eliminar. También se registran escribiéndole a un bot de
WhatsApp ("me compré unos zapatos de $500.000"), que entiende el mensaje con Claude. En **Mi
cuenta**, cada persona puede eliminar su cuenta y todos sus datos (confirmando con su contraseña).

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

Requisitos: Node 22+, pnpm y Docker (o cualquier Postgres). La versión de pnpm la fija
`package.json → packageManager` (10.x): con Corepack (`corepack enable`) o con pnpm 9.7+ instalado, se
usa sola.

```bash
pnpm install
cp .env.example .env            # completa BETTER_AUTH_SECRET con: openssl rand -base64 32
pnpm db:up                      # levanta Postgres con Docker
pnpm db:setup                   # aplica migraciones y crea las categorías por defecto
pnpm dev                        # http://localhost:3000 (antes, copia la base local si hace falta)
```

### Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` / `build` / `start` | Servidor de desarrollo (con la copia diaria de la base local) / build de producción / servir build |
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
| `pnpm db:seed` | Crea las categorías globales por defecto, solo si la base no tiene ninguna (después se administran en `/admin/categorias`) |
| `pnpm db:studio` | Explorador visual de la base de datos |
| `pnpm db:backup` · `db:restore [archivo]` | Copia la base local en `backups/` / la reemplaza con una copia (ver abajo) |
| `pnpm account:delete <correo>` | Borra una cuenta y todos sus datos, para quien lo pide por correo (ver Seguridad → Borrar datos a pedido) |
| `pnpm messages:cleanup` | Borra los mensajes de WhatsApp y los intentos fallidos de vinculación de números sin cuenta, de más de 30 días (`--dias N`, mínimo 7) |
| `pnpm admin:grant <correo>` · `admin:revoke` · `admin:list` | Da o quita el rol de admin, o lista los admins (ver Seguridad → Roles) |
| `pnpm admin:reset-2fa <correo>` | Reinicia la verificación en dos pasos de un admin que perdió el celular y los códigos de respaldo |
| `pnpm bot:try 'texto'` | Muestra cómo interpreta el bot un mensaje (usa la API de Claude). Usa comillas simples si el texto tiene `$` |
| `pnpm bot:eval` | Corre el set de ~55 frases de prueba del bot y reporta aciertos, latencia y costo |

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
  base (`finanzas_e2e_test`): registro, login, ingresos, egresos, balance, editar, borrar y salir (también
  en tamaño de celular), errores del formulario, el límite de intentos de login y que dos usuarios
  no vean los datos del otro. En las pantallas táctiles, además, `e2e/diseno-tactil.spec.ts` recorre
  las páginas con los textos más largos posibles: en el proyecto "celular" a 375, 440 y 956 px
  (horizontal), y en el proyecto "tableta" (iPad, con Chromium) a 768, 820 y 1180 px. Nada puede
  salirse de la pantalla y los campos tienen letra de 16 px o más (con menos, Safari del iPhone y del
  iPad hace zoom al tocarlos; con mouse, 14 px). Ningún texto se sale de su caja (un monto que no
  cabe en su tarjeta) y, en las listas de movimientos, la descripción conserva al menos 100 px aunque
  el monto sea el máximo (en celular, la fila va en dos renglones) y los botones de editar y eliminar
  miden 44 px (con mouse, 28 px). [axe-core](https://github.com/dequelabs/axe-core) revisa cada página
  (WCAG 2.1 A y AA) en modo claro y oscuro, con datos y con los botones principales activos y con el
  mouse encima (axe no revisa el contraste de un botón deshabilitado), y falla ante problemas graves.
  Por eso los botones se oscurecen al pasar el mouse (`hover:brightness-90`) en vez de bajar su
  opacidad, y el texto sobre un color sólido usa su token (`--brand-foreground`,
  `--danger-foreground`), oscuro en modo oscuro. Lo que axe no mide, el
  contraste del borde de los campos y de sus estados (3:1, WCAG 1.4.11), lo exige
  `src/color-contrast.test.ts` con los tokens de `globals.css`: los campos usan `--control`, no
  `--border`. **El bot de WhatsApp de punta a punta**
  (`e2e/bot-whatsapp.spec.ts`): vincular el número desde el dashboard, registrar un gasto escrito
  en lenguaje natural, `balance`, `deshacer`, números sin vincular, firmas falsas, mensajes
  repetidos y audios. Los mensajes llegan al webhook firmados como los manda Meta y la app
  responde a servidores falsos de WhatsApp y Claude (`e2e/fake-services.mjs`): nada sale a
  internet, así que no cuesta nada. La primera vez instala el navegador:
  `pnpm exec playwright install chromium`. En el CI van partidas en 4 jobs que corren a la vez (el
  escritorio en 3 con `--shard` de Playwright, y celular y tableta en la cuarta), y el check
  obligatorio **E2E y accesibilidad** pasa solo si pasan todas. Las partes están en la matriz del job
  `e2e-parte` de `.github/workflows/ci.yml`: si agregas un proyecto de Playwright, súmalo ahí
  (`test/e2e-en-ci.test.ts` falla si falta). La regla de `main` no cambia. Las pruebas que cambian la
  configuración de toda la app (pausar Claude, los topes del bot: `e2e/configuracion-*.spec.ts`) van
  en el proyecto `configuracion`: en local corren después de las demás y en el CI, en su propia parte
  (`--no-deps`), porque a la vez que las otras les cambiarían lo que responde el bot. En un PR que solo cambia
  cosas que las E2E no ejercitan (documentación, skills, otros workflows, pruebas que no son E2E,
  herramientas de `scripts/`), se saltan y el check pasa igual: lo decide `scripts/e2e-needed.mjs`,
  que ante un archivo desconocido las corre. Todo lo que salta las E2E también salta el despliegue
  (una prueba lo exige), y en `main` corren siempre.
- **Auditoría de diseño** (`/auditoria-diseno`, un skill de Claude Code en
  `.claude/skills/auditoria-diseno/`): revisa cómo se ve y cómo se usa la app, más allá de lo que
  cubren las E2E.
  - **Dónde:** en celular, tableta (iPad) y computador, del iPhone SE a un monitor de 1920 px, y en
    320 px y con zoom al 200 % (640 px) para la accesibilidad.
  - **Con qué:** Chromium y WebKit (el motor de Safari), en modo claro y oscuro, y opcionalmente en
    el simulador de iOS.
  - **Cómo trabaja:** un recorrido con Playwright (`recorrido/`) crea cuentas de prueba en la base
    de las E2E y captura cada página y estado.
    - **Qué mide:** lo que se sale de la pantalla o queda tapado, textos cortados, campos de menos
      de 16 px o de altos distintos en una misma fila, zonas táctiles chicas, axe con WCAG 2.2, el
      recorrido con el teclado y los saltos al cargar.
    - **Qué deja:** una galería para comparar las capturas lado a lado.
    - **Después:** Claude y sus subagentes revisan las capturas y los flujos con un checklist (UI,
      UX, accesibilidad, Safari de iOS) y separan los defectos de las sugerencias de diseño.
  - **Modos:**
    - `completa`: una vez al mes o después de una funcionalidad grande;
    - `cambios`: antes de un PR que cambie páginas, componentes o estilos;
    - un área o una página, por ejemplo `/auditoria-diseno tableta` o `/auditoria-diseno /egresos`.
  - **El informe**, con las capturas y la galería, queda en `reports/diseno/` (ignorado por git). Los
    arreglos van en ramas `fix/…`, con una prueba de regresión cuando se puede medir.
  - **WebKit** se instala una vez: `pnpm exec playwright install webkit`.
- **Errores de los formularios**: en español, debajo de cada campo y nunca el globo del navegador
  (que sale en su idioma, "Please fill out this field."). Los traduce `src/lib/field-errors.ts` y
  los muestra `useFieldErrors`; `src/forms.test.ts` exige que todo formulario con campos validados lo
  use, y el fixture `nativeValidation` de `e2e/helpers.ts` hace fallar cualquier E2E en la que
  aparezca el globo.
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
- **Evaluación del bot** (`pnpm bot:eval`): 56 frases contra la API real de Claude. Tiene costo,
  por eso no corre en CI.

Con Docker, `pnpm db:up` crea también la base `finanzas_test` la primera vez.

### Copias de la base local

La base de desarrollo vive en el volumen de Docker de `pnpm db:up` (Postgres 17, como el CI). Un
reinicio del equipo no la borra; sí la borran un "Factory Reset" o la desinstalación de Docker Desktop
o Rancher Desktop, cambiar su motor de contenedores o un `docker system prune --volumes`. Para no
perder las cuentas y los datos de prueba:

- **`pnpm dev` hace una copia al arrancar** si la última tiene más de un día. Si Docker no está
  abierto, avisa y el servidor arranca igual.
- **`pnpm db:backup`** hace una cuando quieras (por ejemplo, antes de limpiar Docker).
- **`pnpm db:restore`** reemplaza la base con la copia más reciente, o con la que le pases
  (`pnpm db:restore finanzas-2026-10-16-164205.sql.gz`). Antes pide escribir el nombre de la base.

Las copias son SQL comprimido en `backups/`, que git ignora (el repo es público), y se guardan las 10
últimas (`scripts/db-backup.ts`). Solo trabajan con una `DATABASE_URL` de `localhost`: nunca copian ni
pisan otra base, como la de producción. Llevan los datos de prueba (correos, movimientos, mensajes del
bot): si las guardas fuera del equipo, que sea en una nube personal.

Para que la base esté lista al prender el equipo, activa en Docker Desktop o Rancher Desktop la
opción de abrirse al iniciar sesión (en Rancher Desktop: *Preferences → Application → General →
Automatically start at login*).

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

- **Apariencia: Sistema, Claro u Oscuro** (Mi cuenta, `src/lib/theme.ts`).
  - **Dónde se guarda:** en el navegador (`localStorage`), no en la cuenta, así que cada dispositivo tiene la suya.
  - **Cómo se aplica:** un script en línea del `<head>` la aplica antes de pintar, sin parpadeo, también en las páginas sin sesión, que se sirven prearmadas.
  - **Los colores** del modo oscuro están dos veces en `globals.css`, uno por cada forma de llegar a él: con el sistema en oscuro y sin `data-theme="light"`, o con `data-theme="dark"`. `src/color-contrast.test.ts` exige que los dos bloques sean iguales.
  - **Sin `dark:`:** la variante de Tailwind solo mira el sistema, así que no se usa.
- **Montos en pesos con centavos, como decimal exacto** (`numeric(18, 2)`), nunca `float` en la
  base: las sumas las hace Postgres. En la app son `number` con hasta dos decimales; para sumar o
  restar en JavaScript, `sumAmounts` y `roundToCents` (`src/lib/money.ts`). Al escribir, el punto
  separa miles y la coma los centavos ("45.900,50"), en el formulario y en el bot; el tope es
  `MAX_AMOUNT` (100 mil millones).
- **"Mes actual" según la zona horaria del usuario** (`America/Bogota` por defecto), para que un
  gasto del 31 a las 10 p. m. no caiga en el mes siguiente por usar UTC.
- **Todas las consultas filtran por `userId`** obtenido de la sesión en el servidor; cada Server
  Action vuelve a validar la sesión.
- **Borrado lógico** (`deleted_at`): permite deshacer.
  - **En el bot:** `deshacer` borra el último movimiento registrado.
  - **En la web:** al borrar un movimiento de Ingresos o Egresos, la lista muestra "Se borró… · Deshacer". El aviso viene en la URL (`?borrado=<id>`) y recibe el foco.
  - **Límite:** `restoreTransactionAction` solo restaura un movimiento propio borrado hace menos de 10 minutos (`UNDO_WINDOW_MS`). Después queda borrado hasta que la limpieza diaria lo elimina del todo.
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

**Límites** (`src/modules/bot/limits.ts`): cada mensaje interpretado es una llamada a Claude con
costo, y la vinculación por código no debe poder adivinarse.
- **Mensajes interpretados por cuenta:**
  - máximo 20 por hora y 100 por día (`src/modules/bot/ai-quota.ts`);
  - antes de llamar a Claude se reserva el cupo marcando el mensaje (`ai_requested_at`), en una
    transacción corta con un bloqueo por cuenta, así una ráfaga simultánea no supera el tope;
  - al pasarlo, el bot avisa y los comandos (`balance`, `deshacer`, `ayuda`) siguen funcionando.
- **Por mensaje:** máximo 20 movimientos (si la IA propone más, pide dividirlo) y `max_tokens` de 2048.
- **La respuesta libre del modelo** (cuando no hay movimientos) va en una línea, con máximo 300
  caracteres. Si trae un enlace se descarta, porque un texto pegado podría hacer que el bot "hable"
  con la voz del servicio.
- **Vinculación:**
  - 5 códigos equivocados por hora y número, contados en el historial dentro de la misma transacción
    que revisa el código, con un bloqueo por número: no dependen de que la respuesta llegue a
    WhatsApp, y los intentos simultáneos no se saltan el límite;
  - el bloqueo se registra una vez por hora;
  - además, máximo 5 códigos nuevos por hora por cuenta.

En desarrollo, sin credenciales de Meta, las respuestas se imprimen en la consola. Para probar sin
WhatsApp, usa el simulador en `/simulador`.

## Seguridad

Resumen de lo que se revisa de forma automática (detalles y cómo reportar en [SECURITY.md](SECURITY.md)):

| Herramienta | Qué hace | Cuándo | ¿Bloquea? |
|---|---|---|---|
| **CodeQL** (`.github/workflows/codeql.yml`) | Análisis estático del código TypeScript y de los workflows (reglas `security-extended`) | Cada PR, cada push a `main` y los miércoles | Sí: el merge se bloquea si un PR agrega alertas altas o críticas |
| **`pnpm audit`** (job de CI) | Vulnerabilidades conocidas en todas las dependencias (también las de desarrollo; las ignoradas, con su porqué en "Versiones forzadas de dependencias") | Cada PR y push | Sí, si son altas o críticas |
| **Dependabot** (`.github/dependabot.yml`) | Alertas y PRs de seguridad, y actualizaciones semanales agrupadas | Lunes y ante cada vulnerabilidad nueva | No: abre PRs que el dueño revisa y fusiona |
| **Secret scanning + push protection** | Detecta credenciales en el repo y **rechaza pushes** que las contengan | Siempre | Sí |
| **OWASP ZAP** (job `dast` del CI) | Escaneo dinámico pasivo del build de producción: cabeceras faltantes, cookies inseguras, fugas de información. Reglas en `.zap/rules.tsv` (FAIL bloquea; WARN aceptadas con su porqué) | Cada PR y push | Sí, ante reglas en FAIL; el despliegue también lo espera |

**Auditoría manual** (`/auditoria-seguridad`, un skill de Claude Code en
`.claude/skills/auditoria-seguridad/`): cubre lo que las herramientas automáticas no ven.
- **Qué revisa:** la autorización entre cuentas, el webhook, el bot (inyección de instrucciones y
  costos), la privacidad, los workflows y la configuración, con un checklist de este proyecto.
- **Cómo trabaja:** verifica cada hallazgo en local antes de reportarlo y ordena los hallazgos por
  severidad.
- **Modos:**
  - `completa`: una vez al mes o después de una funcionalidad grande;
  - `cambios`: antes de un PR que toque autenticación, roles, administración, el webhook, el bot o
    las cabeceras;
  - un área, por ejemplo `/auditoria-seguridad webhook`.
- **Límites:** contra producción solo hace comprobaciones pasivas, y no cambia nada sin
  confirmación.
- **El informe** queda en `reports/seguridad/` (ignorado por git) y **nunca se sube**, porque el
  repo es público. Los arreglos van en ramas `fix/…` con sus pruebas.

**Cabeceras de seguridad** (`src/lib/security-headers.ts`, aplicadas en `next.config.ts` a todas las
rutas): Content-Security-Policy (solo recursos propios, sin iframes ni plugins), HSTS,
X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy y
Cross-Origin-Opener/Resource-Policy; sin `X-Powered-By`. La CSP permite scripts en línea
(`'unsafe-inline'`) porque los nonces no son compatibles con el prerenderizado parcial que usa la
app (guía de CSP de Next 16). Las E2E fallan si la CSP bloquea algo de la app, y los smoke tests
revisan las cabeceras en cada despliegue.

**Riesgos aceptados** (decisiones conscientes). La auditoría de seguridad (`/auditoria-seguridad`) no
los reporta como hallazgos nuevos: los anota como informativos y revisa si cambió lo que los
justifica.

| Decisión | Por qué se acepta | Revisar si… |
|---|---|---|
| **La CSP permite scripts en línea** (`'unsafe-inline'`) | Los nonces no son compatibles con el prerenderizado parcial que usa la app (guía de CSP de Next 16). Sin `unsafe-eval`, sin iframes, con `object-src 'none'` | Next permita nonces (o hashes) con el prerenderizado parcial |
| **El bloqueo por cuenta dura poco** (15 minutos) | Alguien podría bloquear a propósito la cuenta de otra persona; por eso se levanta solo | Hubiera bloqueos repetidos de una misma cuenta en el historial |
| **El registro dice si un correo ya tiene cuenta** ("Ya existe una cuenta con ese correo") | El registro no verifica el correo y crea la sesión de una vez: sin ese aviso, quien se equivocó de botón no entendería qué pasa. El inicio de sesión y el bloqueo no lo revelan, y el registro tiene su límite por IP (3 cada 10 s), así que recorrer una lista de correos es lento y deja rastro | Se agregue la verificación del correo: entonces el registro puede responder siempre igual ("te enviamos un correo") |
| **HSTS con `preload`** (`max-age` de 2 años, `includeSubDomains`) | En `*.vercel.app` no tiene efecto: solo el dueño de un dominio registrable puede pedir que entre a la lista de precarga (hstspreload.org), y nadie lo ha pedido. La cabecera sí obliga HTTPS a cada navegador que ya visitó la app | Se agregue un dominio propio: antes de pedir la precarga, confirmar que **todos** sus subdominios funcionan con HTTPS (salir de la lista tarda meses). Si no se va a pedir, se puede quitar `preload` |
| **Categorías: crear, renombrar y restaurar no piden el código** de Google Authenticator; archivar y eliminar sí (#50) | Son cambios que se ven de inmediato y se deshacen con otro cambio. Cada uno queda en `category_change` con el admin, y la sesión de admin ya exige los dos pasos al entrar | Las categorías empezaran a afectar algo más que el nombre y el emoji (por ejemplo, reglas del bot) |
| **Eliminar una cuenta reinicia el contador de intentos de vinculación de su número** | Conservar esos intentos contradiría "al eliminar la cuenta se borra su historial". Aprovecharlo exige registrarse y vincular el número cada 5 intentos, contra un millón de códigos que viven 10 minutos | Se agregue un contador sin datos personales (por ejemplo, el número con hash, por una hora) |
| **El filtro de enlaces de las respuestas del bot usa una lista de terminaciones** (`.com`, `.co`, `.net`…) | Una terminación rara pasaría, pero la respuesta solo le llega a quien escribió, y además tiene largo máximo | Hubiera respuestas reales con enlaces de otra terminación |
| **El CLI de Vercel del despliegue trae 16 avisos sin versión corregida en su rama** (`.github/vercel-cli/`): 13 de `undici` 5.x, 2 de `@fastify/busboy` 2.x (llega con `undici` 5) y 1 de `braces` | El CLI usa `undici` 5 como cliente HTTP solo contra la API de Vercel, por HTTPS. Los avisos requieren que un servidor malicioso responda, WebSockets (el despliegue no los usa), o encabezados o cuerpos que controle un atacante (son fijos nuestros). `braces` recibe patrones del propio proyecto. Los demás avisos se corrigieron con overrides (ver "Versiones forzadas de dependencias") | Una versión del CLI pase a `undici` 6 o más (Dependabot la propone) |

**Analítica y velocidad:** [Vercel Web Analytics](https://vercel.com/docs/analytics) y
[Speed Insights](https://vercel.com/docs/speed-insights) (`<Analytics />` y `<SpeedInsights />` en
`src/app/layout.tsx`, activadas en Vercel). Son anónimas y sin cookies, y están explicadas en
`/privacidad`. Speed Insights es gratis en Hobby hasta 10.000 eventos cada 30 días; si se llega al
límite, Vercel pausa la recolección sin cobrar. En producción los scripts se sirven desde la
propia app, así que la CSP no cambia; en desarrollo cargan solo los scripts de depuración de
`va.vercel-scripts.com`, que escriben en la consola y no envían nada. El proxy no intercepta las
rutas `/_vercel/`.

**Límite de intentos (contra fuerza bruta):** Better Auth permite 3 intentos de login o registro
cada 10 segundos por IP (y 100 pedidos cada 10 s en el resto de `/api/auth`); después responde 429
y el formulario pide esperar. El contador se guarda en Postgres (tabla `rate_limit`), así que lo
respetan todas las instancias de Vercel; en memoria cada instancia tendría el suyo. La IP sale de
`x-forwarded-for`, que Vercel reemplaza con la IP real del cliente. Lo prueban
`src/lib/rate-limit.int.test.ts` y las E2E. El bot de WhatsApp tiene sus propios límites (README →
Bot de WhatsApp → Límites).

**Logs sin datos personales** (`src/lib/safe-log.ts`): un error se registra con su tipo y su código
(`describeError`), nunca con su mensaje. El de un error de la base trae los parámetros de la consulta
(teléfonos, textos de mensajes, montos), y Better Auth usa un logger propio que los quita.
`src/logs.test.ts` falla si un `console.*` recibe un error crudo. Los textos que llegan (mensajes,
descripciones) se guardan sin caracteres de control: el nulo hacía fallar la base.

**Rutas de Better Auth:** `/api/auth/*` solo atiende las que la app usa desde el navegador
(`AUTH_HTTP_ROUTES` en `src/modules/auth/http-routes.ts`):
- registrarse;
- entrar;
- configurar la verificación en dos pasos;
- escribir el código o un código de respaldo.

Todo lo demás responde 404, incluidas las rutas que agregue una versión nueva de Better Auth:
- cambiar o verificar la contraseña;
- actualizar el perfil;
- listar o cerrar sesiones;
- los proveedores sociales;
- recuperar la contraseña.

Lo que la app hace desde el servidor (leer la sesión, salir, verificar la contraseña al eliminar la
cuenta) llama a `auth.api.*` y no pasa por esas rutas. Las conocidas también están en `disabledPaths`.
`src/lib/auth-routes.int.test.ts` falla si Better Auth trae un endpoint sin clasificar. El nombre se
valida al registrarse: máximo 80 caracteres y sin caracteres de control ni invisibles
(`src/modules/auth/account-name.ts`).

**Bloqueo por cuenta:** el límite por IP no frena a quien reparte los intentos entre muchas IPs.
Por eso, tras 5 contraseñas equivocadas en 15 minutos, la cuenta queda bloqueada 15 minutos, venga
el intento de donde venga (ni la contraseña correcta entra; el formulario dice cuánto falta). Se
cuenta por correo, también para correos que no existen, así que no revela cuáles están registrados.
Un login correcto reinicia el contador. Implementado con hooks de Better Auth
(`src/lib/auth.ts`) y la tabla `login_failure` (`src/modules/auth/lockout.ts`).

Cómo se cuenta un intento:
- **Se reserva antes de verificar la contraseña,** con un `UPSERT` condicional atómico
  (`reserveAttempt`). Así, pedidos simultáneos desde muchas IPs no pasan todos antes de que se
  registre el primer fallo: como mucho se verifican 5.
- **Después se resuelve:** si la contraseña era equivocada queda como fallo; si era correcta se borra
  el contador; si fue otra cosa (un error de validación, una cuenta suspendida) se devuelve
  (`releaseAttempt`).
- **La contraseña de activar la verificación en dos pasos y la de eliminar la cuenta** se cuentan
  igual. Contra: alguien
podría bloquear a propósito la cuenta de otra persona; por eso el bloqueo es corto.

### Roles

Hay dos roles (`src/lib/roles.ts`), guardados en la columna `user.role`:

| Rol | Quién | Qué ve |
|---|---|---|
| `user` | Toda cuenta al registrarse | Resumen, Ingresos, Egresos y Mi cuenta |
| `admin` | Solo quien lo recibe desde la terminal | Todo lo de `user` y la sección de administración (pestaña **Admin**), con verificación en dos pasos obligatoria |

- **No hay usuario ni contraseña de admin por defecto.** El rol se le da a una cuenta que ya
  existe, desde la terminal, y solo puede hacerlo quien tiene la `DATABASE_URL`. Así no queda
  nada en el código (el repositorio es público) ni en Vercel.
- **Nadie puede darse el rol desde la app:** en Better Auth el campo tiene `input: false`, así que
  el registro ignora el rol que mande el cliente. "Actualizar perfil" está apagado por HTTP y, si se
  usara desde el servidor, también lo rechaza (`FIELD_NOT_ALLOWED`). La base solo acepta `user` o
  `admin` (tipo `user_role`). No se usa el plugin `admin` de Better Auth: agregaría endpoints
  (suplantar usuarios, cambiar contraseñas ajenas) que no hacen falta.
- **En el servidor:** las páginas y acciones de administración llaman a `requireAdmin()`
  (`src/lib/session.ts`): sin sesión llevan al login, sin el rol responden 404 (para no revelar que
  la sección existe) y sin la verificación en dos pasos llevan a configurarla. El rol se lee de la
  base en cada pedido: quitarlo surte efecto en el siguiente clic. Solo la página donde se configura
  la verificación usa `requireAdminRole()` (el rol sin la verificación). La matriz de autorización
  falla si una página o acción de admin no los usa así.

**Verificación en dos pasos (solo admins).** Plugin `twoFactor` de Better Auth con Google
Authenticator (o cualquier app TOTP); reglas propias en `src/modules/auth/two-factor-rules.ts`:

- **Configuración, una vez** (`/admin/seguridad`, adonde lleva la pestaña Admin si falta):
  contraseña → QR (dibujado en la app, sin servicios externos; también se muestra la clave para
  escribirla a mano) → primer código → 10 códigos de respaldo de un solo uso. Al activarla se
  cierran las demás sesiones de la cuenta. La clave y los códigos se guardan cifrados.
- **Login:** después de la contraseña se pide el código (o uno de respaldo). Sin "recordar este
  dispositivo". 5 códigos incorrectos seguidos la bloquean 15 minutos (más el límite de 3 intentos
  cada 10 s por IP); las contraseñas equivocadas al activarla cuentan para el bloqueo del login.
- **No se desactiva desde la app:** `disable`, `get-totp-uri`, `generate-backup-codes` y OTP están
  apagados (404), y solo un admin puede activarla. Con la verificación ya activa, `verify-totp` y
  `verify-backup-code` solo sirven para entrar: con una sesión abierta responden 403
  (`TWO_FACTOR_ALREADY_VERIFIED`), porque ahí Better Auth no cuenta los fallos y con la sesión robada de
  un admin se podrían probar códigos sin límite. Si se pierde el celular: un código de respaldo; si
  tampoco, `pnpm admin:reset-2fa --env .env.produccion <correo>` la reinicia y cierra sus sesiones.
- **Sesión cerrada en otro lado** (al activarla, al reiniciarla, al borrar la cuenta): el navegador
  conserva la cookie vieja. `requireUser` manda a `/login?sesion=vencida`, donde el proxy la borra
  y el login avisa "Tu sesión se cerró" (`src/lib/expired-session.ts`); sin eso, el proxy y el
  dashboard se mandaban el uno al otro sin fin.

**Hacerse admin** (en la terminal, dentro de la carpeta del proyecto, con la cuenta ya registrada en
la app):

1. Copia la `DATABASE_URL` de producción de Neon (*Dashboard → Connect*) en un archivo
   `.env.produccion`: una sola línea `DATABASE_URL=...`. Git ignora los `.env*`.
2. Corre `pnpm admin:grant --env .env.produccion tu-correo@...` y escribe el correo para confirmar.
3. Borra el archivo: `rm .env.produccion`.

`pnpm admin:list --env .env.produccion` muestra quiénes son admin (y si tienen la verificación en
dos pasos activa) y `pnpm admin:revoke` quita el rol. Sin `--env`, usan la base local de `.env`.
Después de hacerte admin, la pestaña **Admin** te lleva a configurar la verificación en dos pasos.

### Sección de administración

La pestaña **Admin** (solo para admins) abre `/admin`, organizada en **módulos**. Todos comparten un
marco (`src/app/(app)/admin/layout.tsx`): el título y una subnavegación con chips (Inicio y los
módulos activos). **Inicio** muestra una tarjeta por módulo, con un resumen de los activos; los que
vienen aparecen como "Pronto".

| Módulo | Ruta | Estado |
|---|---|---|
| Historial | `/admin/historial` | Activo: registro y vinculación de WhatsApp |
| Usuarios | `/admin/usuarios` | Activo: cuentas, sesiones y estado; desbloquear, cerrar sesiones, desvincular WhatsApp, suspender, reactivar y eliminar |
| Bot de WhatsApp | `/admin/bot` | Activo: qué pasó con los mensajes, consumo de Claude y errores, sin el texto |
| Categorías | `/admin/categorias` | Activo: crear, editar, archivar, restaurar y eliminar las de ingresos y egresos |
| Salud del sistema | `/admin/salud` | Pronto |
| Configuración | `/admin/configuracion` | Pronto |
| Seguridad | `/admin/seguridad` | Activo: la verificación en dos pasos del admin |

- **Registro único** (`src/modules/admin/modules.ts`): de ahí salen la subnavegación y las tarjetas.
  Una prueba exige que cada módulo activo tenga su página y que no haya páginas de admin fuera del
  registro.
- **Autorización en tres lugares:** cada página y acción llama a `requireAdmin()`, y también cada
  consulta de `src/modules/admin/` (la capa de datos), así que ninguna página puede mostrar esos
  datos aunque olvide validar. El marco valida el rol antes de dibujarse: a quien no es admin no le
  llegan ni el título ni los nombres de los módulos (recibe el 404). La matriz de autorización falla
  si alguna de las tres falta.
- **Rutas viejas** (`/admin?…` del historial y `/admin/verificacion`): redirigen a las nuevas
  (`next.config.ts`).
- Las consultas de los comandos de terminal están en `src/modules/account/terminal.ts`: no validan
  sesión y la app no las puede importar.
- **Listados** (Historial, Usuarios y los que vengan) comparten la lectura de filtros de la URL, las
  fechas en hora de Colombia y los formatos (`src/modules/admin/shared/`), y la barra de búsqueda con
  chips y las etiquetas de filtros activos (`src/app/(app)/admin/chip-filter-bar.tsx` y
  `active-filters.tsx`).

### Usuarios

En **`/admin/usuarios`** el admin ve todas las cuentas, de la más nueva a la más vieja: nombre,
correo, etiqueta de Admin, número de WhatsApp y fecha de registro, y una etiqueta roja si el inicio de
sesión está bloqueado por intentos fallidos. Se busca por nombre, correo o número, y el botón
**Filtros** tiene chips de rol, WhatsApp (vinculado o no), bloqueo y fecha de registro. Se ven 50
cuentas y "Ver más cuentas" suma de a 50, hasta 500 (`src/modules/admin/users/`).

Cada cuenta abre su detalle (`/admin/usuarios/<id>`): rol, registro, último inicio de sesión, WhatsApp
(desde cuándo), bloqueo, la verificación en dos pasos si es admin, sus **sesiones abiertas**
(navegador y sistema, como "Safari · iOS", dirección IP y fechas) y sus últimos 10 eventos, con un
enlace a su historial completo. Better Auth guarda las IPv6 recortadas a la red (/64), así que se
muestran así: `2800:e2:4a:1234::/64`.

**Acciones** (en el detalle; solo las que aplican, y nunca en la cuenta propia ni en la de otro admin:
los roles siguen solo en la terminal):

| Acción | Qué hace | Queda en el historial |
|---|---|---|
| Desbloquear el inicio de sesión | Borra el bloqueo por contraseñas equivocadas (`login_failure`) | `login_unlocked` |
| Cerrar todas sus sesiones | Borra sus sesiones: tiene que volver a entrar. Su WhatsApp sigue | `sessions_revoked` (cuántas) |
| Desvincular su WhatsApp | Lo mismo que hace la persona desde su Resumen | `whatsapp_unlinked` con `by_admin` |
| Suspender la cuenta | Hasta que la reactive un admin: cierra sus sesiones, no puede entrar ni usar el bot. Sus datos se conservan. Motivo opcional e interno | `account_suspended` (con el motivo) |
| Reactivar la cuenta | Puede volver a entrar y a usar el bot | `account_reactivated` |
| Eliminar la cuenta | Lo mismo que `pnpm account:delete`; además pide escribir su correo | Solo `account_deleted`, sin datos de la cuenta |

**Suspensión** (`user.suspended_at`, `src/modules/account/suspension.ts`): Better Auth no le abre
sesiones a una cuenta suspendida (`databaseHooks.session.create.before`, después de la contraseña
correcta: a quien no la sabe no se le revela nada) y responde `ACCOUNT_SUSPENDED`; el formulario dice
"Tu cuenta está suspendida. Si crees que es un error, escríbenos a…", sin el motivo. Si le quedara una
sesión, `getCurrentUser` la ignora. El bot le responde lo mismo y no registra nada (ni llama a Claude).
`suspended_at` es `input: false`: nadie se la quita con "actualizar perfil" (que además está apagado). El motivo
(`suspension_reason`) solo lo ve el admin, en el detalle y en el Historial.

Cada una se confirma en una ventana con el **código de Google Authenticator** del admin
(`src/modules/admin/shared/confirm-code.ts`). No se usa `auth.api.verifyTOTP`: con la sesión abierta,
Better Auth no cuenta los intentos fallidos y acepta el mismo código varias veces. Aquí, los códigos
equivocados suman al mismo contador que el inicio de sesión (5 seguidos bloquean las acciones **y** el
inicio de sesión del admin por 15 minutos) y cada código sirve una sola vez (tabla `admin_code_use`): dos
acciones seguidas necesitan esperar el código siguiente. No acepta códigos de respaldo.

Lo que **no** se muestra, a propósito: montos, movimientos, mensajes del bot y el token de las
sesiones (la consulta ni siquiera lo lee). El último inicio de sesión sale de las sesiones guardadas:
al cerrar sesión se borra, y entonces dice "Sin sesiones guardadas". `/privacidad` explica qué ve el
administrador.

### Bot de WhatsApp

En **`/admin/bot`** el admin ve cómo funciona el bot, de todas las cuentas
(`src/modules/admin/bot/`). Se busca por nombre, correo o número (con espacios o "+") y se filtra por
la fecha de los mensajes, en hora de Colombia.

- **Configuración** (cada cambio pide el código de Google Authenticator y queda en Historial → Acciones
  del admin, con "Bot de WhatsApp" en vez de una cuenta):

  | Ajuste | Qué hace |
  |---|---|
  | Pausar / reanudar Claude | En pausa, el bot no llama a Claude: a lo escrito libremente responde que lo registren en la web, y *balance*, *deshacer* y *ayuda* siguen. No gasta créditos. Para frenar en segundos si algo sale mal o se dispara el gasto, sin desplegar |
  | Topes por cuenta | Mensajes con Claude por hora y por día (1–200 y 1–2.000, el de la hora no mayor que el del día; `AI_LIMIT_BOUNDS`). Al llegar, el bot pide esperar |
  | Tope mensual de tokens | Tokens de Claude al mes, de todas las cuentas (10.000–100.000.000, o sin tope; `MONTHLY_TOKEN_BOUNDS`). Muestra cuánto va del mes y, con el promedio por mensaje, para cuántos mensajes alcanza. Al llegar, el bot deja de usar Claude hasta el mes siguiente (en hora de Colombia), como en pausa. Es un tope suave: mensajes simultáneos pueden pasarlo un poco (`src/modules/bot/token-budget.ts`) |

  Se guarda en una sola fila (`bot_setting`); sin ella valen los de siempre: Claude activo y
  `AI_LIMITS` (20 por hora y 100 por día). El bot la lee en cada mensaje que necesitaría a Claude
  (`src/modules/bot/settings.ts`), así que aplica desde el siguiente. Si Claude está en pausa, la
  tarjeta de Inicio lo dice.

  **Conexiones:** "Probar conexiones" revisa el token de WhatsApp (lee el nombre, el número y la
  calidad del número del bot en la Graph API; necesita el permiso `whatsapp_business_management`, el
  mismo de `scripts/meta-subscribe.sh`) y la API key de Claude (consulta el modelo del bot en la API de
  modelos), sin enviar mensajes ni gastar créditos. Dice por qué falla (token vencido, un permiso o una
  variable que falta, un modelo que ya no existe) con lo que respondió el servicio, nunca la clave, y
  cuándo llegó el último mensaje al webhook: si Meta dejó de enviar, se nota ahí. Solo lee: no pide el
  código ni queda en el historial.
- **Qué pasó con los mensajes:** cuántos llegaron y el resultado de cada uno: registró movimientos,
  comando, respuesta sin registrar nada, vinculó su número, llegó al tope de Claude, Claude en pausa,
  error, código de vinculación inválido, número sin vincular, no era texto, cuenta suspendida o sin
  procesar. Sale del
  estado del mensaje, del tipo de intención y de si el número tiene cuenta. También el tiempo de
  respuesta (mediana y p95). Tocar una barra filtra toda la página por ese resultado (`?resultado=`,
  con su etiqueta y su ✕ en los filtros activos; otra vez, lo quita). Las barras siguen mostrando todos
  los resultados para poder cambiar de uno a otro.
- **Por cuenta:** una fila por cuenta, con los filtros de la página: mensajes, cuántos registraron
  movimientos, tokens de Claude, errores y el último mensaje (hoy, ayer o la fecha), con enlace a su
  detalle en Usuarios. Se ordena por tokens (de la que más usa), mensajes, errores o el último
  (`?orden=`); los números que escribieron sin estar vinculados van juntos al final. Se ven 50 y "Ver
  más cuentas" suma de a 50, hasta 500. En celular, cada cifra lleva su nombre a la vista; desde `sm`,
  van en columnas. Solo cantidades, nunca el texto.
- **Consumo de Claude:** llamadas y tokens de entrada y salida (los que guarda el bot en cada
  mensaje), por día (con "Todo", los últimos 30 días) y por modelo, y las cuentas que llegaron al tope.
  El costo en dinero se ve en la consola de Anthropic: los precios cambian.
- **Errores:** agrupados por motivo (de Claude, al enviar por WhatsApp o internos), con cuántas veces,
  cuántos números y la última vez. Si en las últimas 24 horas hubo respuestas que no salieron por
  WhatsApp (un token vencido o un número fuera de la lista de Meta, ya arreglados), **"Reenviar"** las
  envía otra vez tal cual, sin volver a interpretar ni registrar nada, y sin que el admin las vea: solo
  cuántas son (`src/modules/admin/bot/resend.ts`). Pasadas 24 horas, WhatsApp no deja escribirle a la
  persona. Pide el código y queda en el historial. Lo técnico (el código de Meta o de la API) va aparte, como detalle.

Lo que **no** se muestra, a propósito: el texto de los mensajes, la respuesta del bot y los
movimientos que entendió Claude. Las consultas solo leen el tipo de intención, el motivo de un error y
los tokens; del texto, solo si es la marca de un mensaje que no era texto ("[audio]"), sin devolverlo.
Una prueba revisa el código de las consultas y otra, de integración, que el texto no sale en los
resultados. La tarjeta de Inicio dice cuántos mensajes y errores hubo hoy.

### Categorías

Las categorías globales (las de todas las cuentas) se administran en **`/admin/categorias`**, con una
pestaña para egresos y otra para ingresos: alfabéticas, con **"Otros"** siempre al final, y cuántos
movimientos usan cada una (el total de todas las cuentas, sin montos ni personas). Los cambios se ven
de inmediato en los formularios y en el bot (`src/modules/admin/categories/`).

| Acción | Código | Qué hace |
|---|---|---|
| Crear, editar | No | Nombre (hasta 40 caracteres, sin repetir dentro del tipo: no importan mayúsculas ni tildes, ni las archivadas) y un emoji (vacío es "•") |
| Archivar | Sí | Sale de los formularios y el bot no la usa; los movimientos que ya la tienen la conservan (al editar uno, se sigue ofreciendo marcada "(archivada)") |
| Restaurar | No | Vuelve a los formularios y al bot |
| Eliminar | Sí | Si tiene movimientos, avisa: pasan a "Otros" de su tipo (los de todas las cuentas, también los eliminados), en la misma transacción |

**"Otros"** es la que usa el bot si ninguna encaja: solo se le cambia el emoji (no se renombra, archiva
ni elimina). Cada cambio queda en `category_change` con el admin y el nombre y emoji de ese momento
(así una eliminada se sigue leyendo) y se ve en "Cambios recientes". Las categorías propias de cada
cuenta (`category.user_id`) no se administran aquí.

`scripts/seed.ts` corre en cada despliegue, pero solo crea las categorías por defecto en una base sin
ninguna global: si las creara siempre que faltan, volverían las que el admin renombró o eliminó. Una
categoría nueva para todos se crea desde `/admin/categorias`.

### Historial de las cuentas

La tabla `account_event` (`src/modules/account/events.ts`) guarda el historial de registro y
vinculación de WhatsApp de cada cuenta. El admin lo ve en **`/admin/historial`** como línea de
tiempo de todas las cuentas, agrupada por día ("Hoy", "Ayer", "10 de octubre"…) y en hora de
Colombia: cada evento es una frase con su ícono ("Beto vinculó su WhatsApp +57 300…"). Arriba, la
búsqueda (nombre, correo o número, escrito como sea) y el botón **Filtros**, con chips de tipo de
evento (varios a la vez) y de fecha (Hoy, Últimos 7 días, Últimos 30 días, Todo o un rango
personalizado); los filtros activos se quitan con su ✕ y tocar un nombre muestra solo esa cuenta.
Se ven 50 eventos y "Ver más antiguos" suma de a 50, hasta 500 (`src/modules/admin/history/`). Los filtros
van en la URL (`next/form`) y se validan antes de consultar. `/privacidad` explica qué ve el
administrador.

| Evento | Cuándo | Detalle |
|---|---|---|
| `registered` | Se crea la cuenta (hook de Better Auth) | — |
| `whatsapp_code_created` | Se genera un código para vincular | Sin el código |
| `whatsapp_linked` | El bot recibe `VINCULAR` con un código válido | Número completo |
| `whatsapp_unlinked` | Se desvincula (`by_user`), el número pasa a otra cuenta (`number_moved`) o la cuenta vincula otro número (`number_changed`) | Número |
| `whatsapp_link_failed` | Código inválido o vencido (`invalid_code`) o demasiados intentos (`rate_limited`) | Número; sin cuenta |
| `login_unlocked`, `sessions_revoked`, `account_suspended`, `account_reactivated`, `account_deleted` | Acciones del admin en `/admin/usuarios` (y `whatsapp_unlinked` con `by_admin`) | `admin_id`: quién lo hizo; `details.note`: el motivo de una suspensión |

Las acciones del admin llevan `admin_id` (su cuenta) y tienen su chip, **Acciones del admin**, en los
filtros del Historial; también se ven en el detalle de cada cuenta. Si se borra la cuenta del admin, la
acción queda sin nombre ("Un admin").

Cada evento se guarda en la misma transacción que el cambio. Se borran con la cuenta (incluidos los
intentos fallidos desde su número vinculado); los intentos de números sin cuenta, con
`pnpm messages:cleanup`. La migración `0006` reconstruyó lo que ya había en la base (registros,
vínculos vigentes e intentos fallidos, con `details.reconstructed`); lo borrado antes no se puede
recuperar.

### Borrar datos a pedido

Cada persona puede borrar su cuenta desde **Mi cuenta**. Quien no puede entrar puede pedirlo por
correo, y `/eliminar-datos` promete hacerlo en máximo 30 días. Para eso:

```bash
pnpm account:delete persona@correo.com
```

Borra lo mismo que el botón de la app (`deleteAccountData`): la cuenta, sus sesiones, movimientos,
categorías propias, el número vinculado, sus mensajes del bot (también los que llegaron sin cuenta
desde los números que tuvo antes, salvo que ese número sea hoy de otra cuenta) y sus intentos
fallidos de login.
Antes muestra en qué base de datos va a trabajar (sin la clave) y qué va a borrar, y pide escribir
el correo de nuevo para confirmar. No uses SQL a mano: podrías dejar mensajes o intentos fallidos
sueltos.

**Limpieza diaria automática** (`src/modules/account/retention.ts`): Vercel Cron llama cada día (4:00
a. m. en Bogotá; `vercel.json → crons`) a `GET /api/cron/limpieza`, que solo responde al secreto
`CRON_SECRET`. Borra lo que `/privacidad` promete borrar a los 30 días:
- los mensajes e intentos fallidos de vinculación de números sin cuenta;
- los movimientos eliminados (dejan de verse al eliminarlos y se borran del todo a los 30 días).

En los logs deja solo las cantidades. `CRON_SECRET` es obligatoria (`REQUIRED_ENV`): sin ella, `/api/health`
falla y el despliegue se detiene, para que la limpieza nunca quede apagada sin que nadie lo note.

`pnpm messages:cleanup` hace la limpieza de los datos **sin dueño** a mano, con otro plazo si hace
falta (`--dias N`, mínimo 7, porque Meta puede reenviar un mensaje hasta 7 días después y el registro
evita procesarlo dos veces). Pide escribir `ELIMINAR` para confirmar.

**Contra producción:** los dos usan la `DATABASE_URL` de `.env` (la base local). Para producción,
copia la `DATABASE_URL` de Neon (*Dashboard → Connect*) en un archivo `.env.produccion` (git ignora
todos los `.env*`), pasa `--env .env.produccion` y **borra el archivo al terminar**:

```bash
pnpm account:delete --env .env.produccion persona@correo.com
```

### Versiones forzadas de dependencias

`package.json → pnpm.overrides` fuerza versiones corregidas en dependencias indirectas cuyo paquete
padre todavía no se actualiza. Revísalas cuando se actualicen esos paquetes y bórralas si ya no
hacen falta:

| Override | Por qué | Quitar cuando |
|---|---|---|
| `@esbuild-kit/core-utils>esbuild: ^0.25.4` | `drizzle-kit` 0.31 trae `esbuild` 0.18, vulnerable ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)). Verificado: `drizzle-kit generate`, `check` y `migrate` siguen funcionando | `drizzle-kit` deje de depender de `@esbuild-kit` |
| `typed-rest-client>qs: ^6.16.0` | Stryker 10.0.0 usa `typed-rest-client` 2.x con `qs` vulnerable (3 avisos de DoS) | Stryker actualice `typed-rest-client` a 3.x |

**Avisos ignorados en `pnpm audit`** (`package.json → pnpm.auditConfig.ignoreGhsas`). El CI audita
todas las dependencias, también las de desarrollo, porque `drizzle-kit` y `tsx` corren con la base de
producción en el build. Un aviso solo se ignora si no tiene versión corregida y no se puede explotar
aquí:

| Aviso | Por qué se ignora | Quitar cuando |
|---|---|---|
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) (`braces`, alta) | Solo vía `eslint-config-next` (lint en desarrollo y en el CI), con patrones del propio proyecto: nadie de afuera controla su entrada | Salga una versión corregida de `braces` (o `eslint-config-next` deje de usarlo) |

**Scripts de instalación** (pnpm 10): ninguna dependencia ejecuta scripts al instalarse salvo las
autorizadas, que es la vía de entrada más común de un paquete secuestrado.
- **En la app no se autoriza ninguna.** Las dos que traen scripts quedan en
  `pnpm.ignoredBuiltDependencies`, porque funcionan sin ellos: pnpm ya instala sus binarios nativos
  como dependencias opcionales. Verificado con una instalación limpia: lint, tipos, pruebas, build y
  E2E en verde.
  - `esbuild`: el script solo verifica su binario.
  - `unrs-resolver`: el resolver de `eslint-config-next`.
- **En el CLI de Vercel** (`.github/vercel-cli/`) solo `esbuild` (`pnpm.onlyBuiltDependencies`), como
  hacía `pnpm dlx`.
- **`.npmrc` → `strict-dep-builds=true`:** una dependencia nueva con scripts hace **fallar** la
  instalación hasta decidir. Va en `ignoredBuiltDependencies` si funciona sin ellos (lo preferible) o
  en `onlyBuiltDependencies` si de verdad los necesita, con su porqué en esta sección.
- **`.npmrc` → `minimum-release-age=10080`:** al agregar o actualizar dependencias no se usan
  versiones publicadas hace menos de 7 días, igual que el `cooldown` de Dependabot.

**El CLI de Vercel del despliegue** vive aparte, en `.github/vercel-cli/`, con su propio
`pnpm-lock.yaml`. El job de despliegue lo instala con `--frozen-lockfile`, así que ninguna de sus
casi 300 dependencias cambia sin un PR (antes, `pnpm dlx` las resolvía en cada despliegue, con el
token de Vercel a mano).
- **Por qué fuera de la app:** sus builders (Python, contenedores…) traen dependencias con avisos
  conocidos que este proyecto no usa, y así no se instalan en los demás jobs ni entran en el
  `pnpm audit` de la app.
- **Cómo actualizarlo:** Dependabot lo propone (con `cooldown`), o a mano: cambia la versión en
  `.github/vercel-cli/package.json` y corre `pnpm install --dir .github/vercel-cli`.
- **Versiones forzadas del CLI** (`.github/vercel-cli/package.json → pnpm.overrides`): corrigen 22
  avisos de sus dependencias internas, siempre dentro de la misma versión mayor para no romperlo:
  - `tar` 7.5.22 (incluido un aviso crítico);
  - `minimatch` 10.2.6;
  - `js-yaml` 4.3.2;
  - `smol-toml` 1.9.0;
  - `path-to-regexp` 6.3.0 y 8.4.2;
  - `ajv` 8.18.0;
  - `undici` 5.29.0.

  Verificado con un `vercel build` local completo. Al actualizar el CLI, bórralas y vuelve a correr
  `pnpm audit --dir .github/vercel-cli`: si la versión nueva ya trae las corregidas, sobran.

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
   (`vercel rollback`) y el job queda en rojo. También si el job se cancela a mitad, por ejemplo al
   llegar al tiempo máximo.

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

**Cada despliegue exitoso publica una [release](https://github.com/santirogu/finanzas-mvp-wp-bot/releases)**
(job `release`, `scripts/release.mjs`). La versión sale de los Conventional Commits desde la release
anterior: un `feat` sube la menor (1.2.0 → 1.3.0), un `!` (cambio incompatible) la mayor
(1.2.0 → 2.0.0) y cualquier otro cambio el parche (1.2.0 → 1.2.1); la primera fue la 1.0.0. Las
notas agrupan los cambios por tipo con el número de cada PR. La versión vive en los tags de git
(`v1.2.0`), no en `package.json`. Los cambios que no despliegan (docs, CI, pruebas) entran en la
release del siguiente despliegue; un despliegue fallido no publica release.

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
