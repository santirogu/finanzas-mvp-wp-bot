# Anotado (antes, Finanzas MVP) + bot de WhatsApp

App web para registrar ingresos y egresos y ver el balance del mes actual. Cada usuario tiene
su propia sesión y su dashboard con cinco pestañas: **Resumen**, **Ingresos** y **Egresos**, donde
cada movimiento se puede editar o eliminar, **Fijos**, con los gastos que se repiten cada mes, y
**Reportes**, con cómo le va mes a mes. Los movimientos también se registran escribiéndole a un bot de
WhatsApp ("me compré unos zapatos de $500.000"), que entiende el mensaje con Claude. En **Mi
cuenta**, cada persona cambia su contraseña, conecta o desvincula su WhatsApp, elige la apariencia y puede eliminar su cuenta
y todos sus datos (confirmando con su contraseña).

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
| `pnpm test:mutation` | Mutation testing con Stryker, de toda la lista de `stryker.config.mjs`; reporte en `reports/mutation/` (horas) |
| `pnpm test:mutation:cambios` | Lo mismo, solo con los archivos de la lista que cambiaste frente a `origin/main` (minutos) |
| `pnpm smoke <url>` | Smoke tests contra una versión publicada (lo corre el despliegue; ver abajo) |
| `pnpm db:generate` | Genera una migración SQL tras cambiar `src/db/schema/*` |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm db:check-drift` | Verifica que cada cambio del esquema tenga su migración (lo corre el CI) |
| `pnpm db:seed` | Crea las categorías globales por defecto, solo si la base no tiene ninguna (después se administran en `/admin/categorias`) |
| `pnpm db:studio` | Explorador visual de la base de datos |
| `pnpm db:backup` · `db:restore [archivo]` | Copia la base local en `backups/` / la reemplaza con una copia (ver abajo) |
| `pnpm account:delete <correo>` | Borra una cuenta y todos sus datos, para quien lo pide por correo (ver Seguridad → Borrar datos a pedido) |
| `pnpm messages:cleanup` | Borra los mensajes de WhatsApp y los intentos fallidos de vinculación de números sin cuenta, de más de 30 días (`--dias N`, mínimo 7) |
| `pnpm admin:grant <correo>` · `admin:revoke` · `admin:super` · `admin:list` | Da o quita el rol de admin, marca al super admin o lista los admins (ver Seguridad → Roles) |
| `pnpm admin:reset-2fa <correo>` | Reinicia la verificación en dos pasos de un admin que perdió el celular y los códigos de respaldo |
| `pnpm bot:try 'texto'` | Muestra cómo interpreta el bot un mensaje (usa la API de Claude). Usa comillas simples si el texto tiene `$` |
| `pnpm bot:eval` | Corre el set de frases de prueba del bot (con los mensajes trampa) y reporta aciertos, latencia y costo. Cuesta créditos |
| `pnpm brand:assets` | Regenera los íconos y la imagen para compartir a partir del logo (ver Estructura → Marca) |

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
  internet, así que no cuesta nada. Lo que solo falla en Safari (`@safari`) corre además con WebKit,
  el motor de Safari, en un iPhone y un iPad (proyectos "iphone" e "ipad"): por ejemplo, tocar una
  sugerencia de la descripción. La primera vez instala los navegadores:
  `pnpm exec playwright install chromium webkit`. En el CI van partidas en 4 jobs que corren a la vez (el
  escritorio en 3 con `--shard` de Playwright, y celular, tableta, iPhone y iPad en la cuarta, la única
  que instala WebKit), y el check
  obligatorio **E2E y accesibilidad** pasa solo si pasan todas. Las partes están en la matriz del job
  `e2e-parte` de `.github/workflows/ci.yml`: si agregas un proyecto de Playwright, súmalo ahí
  (`test/e2e-en-ci.test.ts` falla si falta). La regla de `main` no cambia. Las pruebas que cambian la
  configuración de toda la app (pausar Claude, los topes del bot, cerrar los registros:
  `e2e/configuracion-*.spec.ts`) van en el proyecto `configuracion`: en local corren después de las demás
  y en el CI, en su propia parte (`--no-deps`), porque a la vez que las otras les cambiarían lo que
  responde el bot o no las dejarían crear cuentas. Dentro del proyecto, un archivo a la vez. En un PR que solo cambia
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
- **Auditoría de pruebas** (`/auditoria-pruebas`, un skill de Claude Code en
  `.claude/skills/auditoria-pruebas/`): revisa si las pruebas detectarían de verdad un error, no solo
  cuánto código recorren.
  - **Qué revisa:**
    - el código que la cobertura no mide o que ninguna prueba importa;
    - los sobrevivientes de Stryker y la lógica fuera de su lista;
    - las pruebas frágiles: saltadas, con esperas fijas, con aserciones débiles o que dependen de
      otra;
    - las intermitentes del CI;
    - las reglas de CLAUDE.md sin la prueba que las sostiene;
    - por riesgo, que el dinero, el acceso a los datos, el bot, el borrado de datos y las fechas
      tengan pruebas del nivel correcto y con sus casos borde.
  - **Cómo trabaja:**
    - un inventario automático (`inventario.mjs`, solo lee archivos) junta lo mecánico;
    - la cobertura, el último reporte de Stryker y el historial del CI completan las medidas;
    - Claude y sus subagentes revisan las pruebas con un checklist;
    - cada hallazgo se demuestra metiendo el error en un worktree aparte (sin tocar la copia de
      trabajo) y viendo que ninguna prueba falla. Stryker solo corre si se pide: tarda.
  - **Modos:**
    - `completa`: una vez al mes;
    - `cambios`: antes de un PR que agregue o cambie lógica;
    - un área, por ejemplo `/auditoria-pruebas e2e` o `/auditoria-pruebas mutacion`.
  - **El informe** queda en `reports/pruebas/` (ignorado por git). Los arreglos van en ramas `test/…`.
- **Auditoría de textos** (`/auditoria-textos`, un skill de Claude Code en
  `.claude/skills/auditoria-textos/`): revisa cómo está escrito lo que ve la persona, en español según
  la RAE y en inglés.
  - **Qué revisa:**
    - la ortografía, la gramática y la puntuación;
    - las expresiones censuradas, las redundancias y los textos largos o poco claros;
    - que se usen las mismas palabras para lo mismo, según su glosario (`glosario.md`, que también
      sirve al escribir un texto nuevo);
    - que el inglés diga lo mismo que el español y no suene traducido.
  - **Dónde:** pantallas, botones, errores, avisos, `aria-label` y `alt`, los mensajes del bot, el PDF
    y las páginas legales. El prompt del bot queda fuera: cambiarlo pide `pnpm bot:eval`.
  - **Cómo trabaja:**
    - un inventario automático (`textos.mjs`, solo lee archivos) extrae todos los textos con su
      archivo y su línea, y marca lo mecánico: tildes, signos sin pareja, comillas rectas, frases
      largas, palabras repetidas, claves cuyo inglés no tiene los mismos datos que el español;
    - Claude y sus subagentes leen los textos con un checklist;
    - cada hallazgo se verifica con su regla y su fuente (el DLE, el DPD, la FundéuRAE o el glosario).
      Lo que no tiene regla va aparte, como sugerencia.
  - **Modos:**
    - `completa`: una vez al mes o después de una funcionalidad grande;
    - `cambios`: antes de un PR que agregue o cambie textos;
    - un área o una página, por ejemplo `/auditoria-textos en` o `/auditoria-textos /egresos`.
  - **El informe**, con los textos extraídos, queda en `reports/textos/` (ignorado por git). Los
    arreglos van en ramas `fix/…`.
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
  WhatsApp, transacciones, reportes (con los próximos pagos y la vista del PDF) y notificaciones, el
  webhook y los scripts del CI. El reporte HTML queda en
  `reports/mutation/index.html`. Falla si el puntaje baja del umbral `break` de `stryker.config.mjs`,
  pero no bloquea el merge.
  - **Cuánto tarda:** cada mutante corre la suite unitaria completa (el runner por comando: el de
    Vitest para Stryker todavía no soporta Vitest 5). La lista entera son ~5000 mutantes, unas 8 horas
    en un runner de GitHub, más de lo que dura un job.
  - **En un PR**, al ponerle la etiqueta `mutation-testing` (y en cada push mientras la tenga), muta
    **solo los archivos de la lista que el PR cambió** (`scripts/mutation-targets.mjs`): minutos. Si el
    PR agrega archivos a la lista de `stryker.config.mjs`, también muta esos (si no, nada los mutaría
    hasta el lunes). Si no cambió ninguno, lo dice y termina. Al cerrar o fusionar el PR, la corrida que
    quede se cancela.
  - **Cada lunes** sobre `main` y con *Actions → Mutation testing → Run workflow*, la lista completa,
    repartida en partes de ~45 minutos (parejas por tamaño del código) que corren a la vez; un último
    job junta sus reportes en un resumen.
  - **En local**, `pnpm test:mutation:cambios` muta lo que cambiaste frente a `origin/main` (con lo que
    no está en un commit) y lo que agregaste a la lista.
- **Evaluación del bot** (`pnpm bot:eval`, `src/modules/bot/eval/`): 65 frases contra la API real de Claude, con
  7 **mensajes trampa** (que revele sus instrucciones o una clave, que se salga de su papel, que confirme un borrado
  que no hizo, que invente cifras de otra persona, un JSON o una instrucción escondida en la descripción para que
  registre lo que no pasó). Tiene costo (unos US$0,02 por corrida con Haiku).
  - **En local**, a mano y con permiso del dueño: falla con cualquier caso mal (`--min` cambia el mínimo).
  - **Cada lunes** (7:17 a. m. en Bogotá) y con *Actions → Evaluación del bot → Run workflow* (eligiendo el
    modelo), `.github/workflows/bot-eval.yml`: falla si cae una trampa o si el resto acierta menos del 95 %, y GitHub
    le avisa al dueño por correo. El detalle queda en el resumen de la corrida. Nunca corre en PRs (el repositorio
    es público y la corrida usa un secreto) y el secreto solo llega al paso que llama a Claude.
  - **La API key del CI** es una aparte, con tope de gasto (decisión del dueño): en la [consola de
    Anthropic](https://console.anthropic.com), un workspace solo para la evaluación con un límite de gasto mensual
    (por ejemplo US$1) y una key en él; en GitHub, *Settings → Secrets and variables → Actions → New repository
    secret* con el nombre `ANTHROPIC_API_KEY_EVAL`. Sin el secreto, el workflow no hace nada (deja un aviso).
    Para cambiarla, se crea otra, se reemplaza el secreto y se borra la vieja en la consola.

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
  app/[lang]/                       Las páginas, una vez por idioma (el proxy agrega el idioma por dentro: ver Idiomas)
    (auth)/login, (auth)/registro   Páginas públicas de acceso
    (app)/dashboard                 Resumen: balance del mes (y frente al anterior), lo que te queda, presupuestos, últimos movimientos, gastos por categoría (dona)
    (app)/cuenta                    Mi cuenta: tus datos, seguridad (cambiar la contraseña), WhatsApp y eliminar la cuenta
    (app)/configuracion             Configuración: presupuestos, avisos de próximos pagos, apariencia e idioma
    (app)/ingresos, (app)/egresos   Formulario + listado del mes (vista compartida)
    (app)/reportes                  Reportes: 12 meses (o un año), barras por mes, categorías frente a su promedio, gastos fijos, los más grandes y qué días gastas más
    (app)/presupuestos              Presupuestos: un monto por mes por categoría de egresos y cómo va cada uno (se llega desde el Resumen)
    (app)/month-nav.tsx             Navegador de meses (flechas y tarjeta del año) del Resumen, Ingresos y Egresos
    (app)/account-menu.tsx          Menú de la cuenta del encabezado (iniciales, escudo de admin, Mi cuenta, Configuración, Ayuda y Salir)
  app/api/auth/[...all]             Endpoints de Better Auth
  i18n/                             Idiomas: la lista, los textos de cada uno (dictionaries/) y la ruta sin el idioma
  db/schema/                        Tablas: auth (user, session…) y finanzas (category, transaction)
  lib/
    auth.ts, session.ts             Config de auth y Data Access Layer (único lugar que lee la sesión)
    money.ts, dates.ts              Formato/parsing de COP y "mes actual" según zona horaria
    month-nav.ts                    El mes que pide la URL (?mes=) y los enlaces del navegador de meses
  modules/transactions/             Consultas, Server Actions y validación de movimientos
  modules/reports/                  Reportes: el período (?periodo=), sus consultas por mes, los cálculos (promedios, gastos fijos, gasto por día) y el CSV
  modules/bot/                      Intérprete de mensajes (comandos fijos + Claude + validación) y flujo completo
  modules/whatsapp/                 Webhook: firma, payload, envío de mensajes y vinculación de números
  app/api/whatsapp/webhook          Endpoint que recibe los mensajes de Meta
  app/(app)/simulador               Chat de prueba del bot (solo en desarrollo)
  proxy.ts                          Redirecciones rápidas según haya cookie de sesión, y el idioma de cada página
scripts/seed.ts                     Categorías por defecto
```

### Marca

La app se llama **Anotado** (antes, Finanzas MVP): escribes el gasto por WhatsApp y queda anotado. El
logo es un globo de chat con un ✓, con el verde azulado de la app (`--brand`).
- **El nombre** sale de `BRAND_NAME` (`src/lib/brand.ts`), el mismo en todos los idiomas: nunca se
  escribe a mano. Siempre "Anotado", con mayúscula, también en el logo.
- **El logo** (`src/components/logo.tsx`) se dibuja desde `src/lib/brand-mark.json` y usa los colores de
  la marca de cada tema: en oscuro, el cuadro verde claro y el globo oscuro.
- **Los íconos y la imagen para compartir** salen del mismo dibujo con `pnpm brand:assets`
  (`scripts/brand-assets.mjs`, con Chromium de Playwright):
  - `src/app/icon.svg`, `favicon.ico` y `apple-icon.png`, la pestaña y la pantalla de inicio del iPhone;
  - `public/marca/`, los del manifest (`src/app/manifest.ts`);
  - `src/app/opengraph-image.png`, la vista previa al compartir el enlace;
  - `public/app-icon-1024.png`, el ícono de la app en Meta.

  Una prueba exige que `icon.svg` esté al día con el dibujo y que sus colores sean los de `--brand`.
  La portada se arma al compilar: la imagen para compartir lleva la URL de producción que el job de
  despliegue pasa al build (`PRODUCTION_URL`, que `next.config.ts` fija como `APP_PUBLIC_URL`). Un
  smoke test revisa que no diga `localhost`. Si se suma un dominio propio, cambia `PRODUCTION_URL` en
  `.github/workflows/ci.yml`.
- **Google Authenticator** muestra la app como "Anotado". Quien lo configuró antes la ve como "Finanzas
  MVP", y sus códigos sirven igual.
- **Fuera del repo:**
  - el nombre visible del número en Meta (WhatsApp Manager), que pasa por una revisión;
  - el ícono de la app en Meta for Developers.

  El repositorio y el proyecto de Vercel conservan el nombre viejo.

### Idiomas

La app está en español (el de siempre) y en inglés, toda la web (el bot de WhatsApp sigue en español).

- **Cuál ve cada quien:**
  1. el que eligió en **Configuración → Idioma** (`saveLanguageAction`): se guarda en su cuenta
     (`user.locale`) y en la cookie `idioma` de ese navegador, por un año;
  2. si no eligió en ese navegador, el de su cuenta: al iniciar sesión (también tras el segundo paso de un
     admin), Better Auth le pone la cookie (`hooks.after` en `src/lib/auth.ts`);
  3. sin sesión, el que eligió en el selector **ES · EN** de la portada, el login o el registro
     (`src/components/language-switch.tsx`, `chooseLanguageAction`): solo la cookie, por un año, y vuelve a la
     misma página (nunca a otra dirección: `LANGUAGE_SWITCH_PAGES`);
  4. si no, español, aunque el navegador pida otro idioma (decisión del dueño: el público es colombiano y el
     bot y las páginas legales están en español).

  `user.locale` es `null` hasta que la persona elige (la base solo acepta `es` o `en`), y nadie más lo
  cambia: Better Auth lo tiene con `input: false`. La política de privacidad lo explica.

- **Las direcciones no llevan el idioma.** Las páginas están en `src/app/[lang]/` y el proxy
  (`src/proxy.ts`) arma cada una, por dentro, en el idioma de la cookie `idioma` (o, sin ella, en español):
  `/dashboard` se arma como `/es/dashboard` (o `/en/dashboard`), y el navegador sigue viendo `/dashboard`
  (`src/i18n/locales.ts`).
- **Por qué así:** el `<html lang>` y los textos salen del segmento (`next/root-params`), sin leer
  cookies al armar la página. Las páginas públicas (inicio, login, registro, privacidad) siguen
  prearmadas, una vez por idioma.
- **Los textos** van junto a quien los usa, con `texts({ …español }, { en: { …inglés } })`
  (`src/i18n/texts.ts`): el español manda y TypeScript exige las mismas claves en el inglés. Un texto con
  datos es una función. Se leen con `getTexts()` en el servidor (`src/i18n/server.ts`, que también da
  `getLocale()`) y con `useTexts()` en el cliente (`src/i18n/client.tsx`: el layout raíz pone el idioma).
  Un componente que usan el servidor y el cliente (`TransactionList`) recibe el idioma por prop.
- **En las Server Actions** no hay segmento `[lang]`: el idioma sale de la cookie (o del navegador, como
  en el proxy) con `getRequestLocale()` (`src/i18n/request.ts`) y se pasa a la función del módulo que arma el mensaje
  (`skipFixedPayment(…, locale)`). El monto del formulario se lee con los separadores de ese idioma
  (`transactionSchema(locale)`). Las acciones del admin leen la cookie dentro del módulo
  (`confirmAdminCode` y las de `src/modules/admin/users/account-actions.ts`): las Server Actions de la
  página no lo pasan.
- **En las pruebas:** los componentes, `render(ui, { wrapper: InEnglish })` (`test/locale.tsx`) o
  `renderWithToaster(ui, { english: true })`; las acciones en integración, `requestLocale.value = "en"`
  (`test/integration/locale.ts`). `next/root-params` y `getRequestLocale` se simulan en los archivos de
  configuración de cada proyecto de Vitest (español por defecto). Las E2E en inglés están en
  `e2e/idioma-ingles.spec.ts` (las demás corren con el navegador en `es-CO`), y el recorrido de la
  auditoría de diseño tiene su modo en inglés (`AUDITORIA_IDIOMA=en`).
- **Montos y fechas:** `formatMoney`, `parseAmountInput`, `formatAmountTyping`, `formatMonthName`,
  `formatShortDate`… reciben el idioma (por defecto, español). En inglés, con el formato de EE. UU.:
  "$1,000,000.00" (en el campo de monto, la coma separa los miles) y "Oct 13". El bot sigue en español.
  Los topes del bot en `/admin/bot` también se escriben con los miles del idioma ("1.000" o "1,000"):
  los campos y el servidor (`parseAiLimits`, `parseMonthlyTokenLimit`) aceptan ese separador y no el otro.
- **Las categorías** se ven en inglés con el nombre que les puso el admin (`category.name_en`, opcional,
  en `/admin/categorias`); sin él, con el de siempre. Lo resuelven las consultas (`categoryNameIn` y
  `categoryLabel`, `src/modules/transactions/category-name.ts`), que reciben el idioma: las que no lo
  reciben, como las del bot, dan el nombre en español. Lo que se guarda y lo que conoce el bot es siempre
  `name`.
- **En la administración** quedan en español los comandos del bot (balance, reporte, deshacer, ayuda),
  que se escriben así. Los avisos de la prueba de conexiones son datos (`ServiceWarning`,
  `src/lib/service-check.ts`): la frase la arma `connectionView` en el idioma de la página.
- **Las descargas de Reportes** salen en el idioma de la página (la cookie). El CSV en inglés va como lo
  abre el Excel en inglés: separado por "," y con el punto de los centavos (en español, ";" y la coma), y
  los archivos se llaman `transactions-…csv` y `report-…pdf`. Los textos fijos del PDF van en la vista
  (`view.labels`, `src/modules/reports/pdf/view.ts`), así se prueban sin dibujarlo.
- **Solo en español:** la política de privacidad y "Eliminar tus datos" (decisión del dueño). Sus páginas
  van con `lang="es"` y, con la app en inglés, una nota arriba lo dice (`privacidad/spanish-only.tsx`).
  También el bot: el mensaje para vincular WhatsApp sigue siendo `VINCULAR <código>` y la Ayuda en
  inglés lo aclara.
- **Eliminar la cuenta** pide la palabra del idioma de la página: `ELIMINAR` o, en inglés, `DELETE`
  (`src/modules/account/confirmation.ts`).
- **En un componente de cliente**, la ruta actual se lee con `useAppPathname()` (`src/i18n/navigation.ts`),
  nunca con `usePathname()`: con la reescritura del proxy, el servidor y el navegador pueden ver
  `/es/ayuda` o `/ayuda`, y eso marcaba mal la pestaña o volvía a una dirección con el idioma.
  `src/i18n/guard.test.ts` lo exige.
- **La 404:** una dirección que no es una página la atiende `src/app/[lang]/[...rest]` (con el título) y
  `not-found.tsx`, en el idioma de la página. Lo que no es una página (una ruta de la API que no existe)
  va a `src/app/global-not-found.tsx` (en español), con `experimental.globalNotFound` en `next.config.ts`.

### Decisiones importantes

- **Cambiar la contraseña** (Mi cuenta → Seguridad, `changePasswordAction` en `src/modules/account/actions.ts`).
  - **Qué pide:** la actual, la nueva (de 8 a 128 caracteres, como en el registro, y distinta de la actual) y
    repetirla. Un admin con la verificación en dos pasos, además, su código de Google Authenticator
    (`confirmAdminCode`: límite de intentos y un solo uso por código).
  - **Contra quien tiene una sesión robada:** las contraseñas equivocadas cuentan para el mismo bloqueo del
    login (5 seguidas, 15 minutos).
  - **Cómo se hace:** una Server Action con `auth.api.changePassword` (la ruta HTTP de Better Auth sigue
    apagada) y después `auth.api.revokeOtherSessions`, que cierra las demás sesiones y deja la de este
    dispositivo. Con `revokeOtherSessions: true` de `changePassword`, Better Auth abre una sesión nueva
    cuya cookie no llega desde la Server Action, y se cerraba también esta.
  - **Historial:** queda como `password_changed`, sin la contraseña.
  - **Lo que viene:** cambiar el correo se ve en "Tus datos", apagado con "Pronto". Llega cuando la app
    pueda enviar correos para confirmar el nuevo: sin eso, un correo mal escrito dejaría a la persona sin
    poder entrar. La moneda se muestra ("Peso colombiano (COP)") con "Pronto: USD y EUR".
- **Apariencia: Sistema, Claro u Oscuro** (Configuración, `src/lib/theme.ts`).
  - **Dónde se guarda:** al elegirla, en la cuenta (`user.theme`, con `saveThemeAction`) y en la cookie `tema` de
    ese navegador, por un año. Al iniciar sesión en otro navegador (también tras el segundo paso de un admin),
    Better Auth le pone la cookie desde la cuenta (`hooks.after` en `src/lib/auth.ts`), como con el idioma. Sin
    elegir (`null`), cada navegador tiene la suya. La cookie no es `HttpOnly`: la lee el script del `<head>`.
    Antes se guardaba solo en `localStorage`; sin la cookie, todavía vale lo de ahí, y se sigue escribiendo para
    avisar a las otras pestañas (el evento `storage`).
  - **Cómo se aplica:** un script en línea del `<head>` la aplica antes de pintar, sin parpadeo, también en las páginas sin sesión, que se sirven prearmadas.
  - **Los colores** del modo oscuro están dos veces en `globals.css`, uno por cada forma de llegar a él: con el sistema en oscuro y sin `data-theme="light"`, o con `data-theme="dark"`. `src/color-contrast.test.ts` exige que los dos bloques sean iguales.
  - **Sin `dark:`:** la variante de Tailwind solo mira el sistema, así que no se usa.
- **Montos en pesos con centavos, como decimal exacto** (`numeric(18, 2)`), nunca `float` en la
  base: las sumas las hace Postgres. En la app son `number` con hasta dos decimales; para sumar o
  restar en JavaScript, `sumAmounts` y `roundToCents` (`src/lib/money.ts`). Al escribir, el punto
  separa miles y la coma los centavos ("45.900,50"), en el formulario y en el bot; el tope es
  `MAX_AMOUNT` (100 mil millones). En el formulario, al salir del campo, el monto se completa con sus
  dos decimales (`completeAmountDecimals`: "500.000" → "500.000,00"), y al editar ya viene con ellos.
- **Sugerencias de la descripción** (al registrar un movimiento nuevo):
  - **Qué sugiere:** las descripciones que la persona ya usó en ese tipo en los últimos 6 meses (`listDescriptionSuggestions`), hasta 300 (`DESCRIPTION_SUGGESTIONS`), las más usadas primero. "Mercado" y "mercado " son la misma, escrita como la última vez. Con 20 se perdían las que se usan cada tanto.
  - **Cómo se ven:** en una lista propia debajo del campo (`src/components/description-suggestions.tsx`), no en la del navegador (`<datalist>`, que cada sistema dibuja a su manera y pinta el campo de azul).
    - Muestra hasta 6 que coincidan con lo escrito (`src/lib/suggestions.ts`), sin importar mayúsculas ni tildes, y solo al comienzo de una palabra: "arri" trae "Arriendo Civita", pero "ari" no trae "hipotecario". Primero van las que empiezan igual. La parte que coincide va resaltada, y a la derecha va su categoría.
    - Es el patrón "combobox" de ARIA: el foco se queda en el campo, las flechas recorren la lista, Enter elige (sin enviar el formulario), Escape y Tab la cierran, y también se elige con un toque.
  - **La categoría:** al elegir una, se propone la de la última vez, salvo que la persona ya haya elegido una a mano o que esa categoría ya no se pueda elegir (archivada). El lector de pantalla avisa qué categoría se eligió.
  - **Privacidad:** solo salen los movimientos propios, no los eliminados (prueba de integración con dos usuarios). No se guarda nada nuevo.
- **Campos obligatorios del formulario de movimientos:** monto, descripción y fecha llevan un asterisco
  rojo, explicado con "* Obligatorio" arriba. La categoría es opcional ("Sin categoría"). El asterisco
  es solo visual: el lector de pantalla anuncia "obligatorio" por el `required` de cada campo.
- **"Mes actual" según la zona horaria del usuario** (`America/Bogota` por defecto), para que un
  gasto del 31 a las 10 p. m. no caiga en el mes siguiente por usar UTC.
- **Otros meses en el Resumen, Ingresos y Egresos** (`src/lib/month-nav.ts`).
  - **En la URL:** `?mes=2026-09`, así que funcionan el botón de atrás y los enlaces. Sin él, o con un
    mes inválido o futuro, se ve el actual. En el mes actual los enlaces van sin `?mes=`.
  - **Cómo se elige:** cualquier mes, tenga o no movimientos.
    - Con las flechas ‹ ›: la de la derecha se apaga en el mes actual (no hay movimientos futuros) y la
      de la izquierda en enero de 2000 (`FIRST_MONTH`, el primero que acepta la URL).
    - Con la tarjeta que se abre al tocar el nombre del mes: los 12 meses del año, con flechas para
      cambiar de año sin navegar. Marca el mes que se ve, el actual y, con un punto, los que tienen
      movimientos (`listActiveMonths`); los futuros están apagados.
    - Con "Volver al mes actual".
  - **Se mantiene:** las pestañas y las tarjetas del Resumen llevan el mismo `?mes=`, y al editar,
    borrar o deshacer un movimiento se vuelve a la lista del mes de su fecha.
  - **El formulario** propone el mismo día del mes que se ve (`sameDayIn`): mirando septiembre el 17 de
    octubre, el 17/09; si el mes no tiene ese día, el último (el 31 en septiembre es el 30). En el mes
    actual, hoy. Si el movimiento nuevo cae en otro mes que el de la lista, el aviso dice en cuál quedó
    ("Egreso registrado en octubre de 2026").
  - **Comparación con el mes anterior** (`src/modules/transactions/month-comparison.ts`), en las tres
    tarjetas del Resumen: el balance en plata ("$120.000,00 más que agosto") y los ingresos y egresos
    en porcentaje ("15 % más que agosto"). Con el mes en curso, contra el anterior hasta el mismo día
    (`monthRangeUpTo`: "15 % más que a esta altura de agosto"), porque contra el mes entero a mitad de
    mes casi todo daría "menos que". No aparece si el mes anterior (hasta ese día) no tuvo movimientos.
    El balance del bot ("balance") compara igual.
  - **Cuánto se ahorró** (`monthSavedNote`), debajo del balance: "Vas ahorrando el 29 % de tus
    ingresos" en el mes en curso, "Ahorraste…" en uno pasado. Nada si no sobró (el balance en naranja ya
    lo dice).
- **Buscar en la lista del mes de Ingresos y Egresos** (`src/components/searchable-transaction-list.tsx`):
  - **Cuándo aparece:** desde 6 movimientos en el mes (`SEARCH_FROM`). Con menos se ven todos de un
    vistazo. Si ya se estaba usando, no desaparece aunque queden menos (al borrar uno mientras se busca).
  - **Qué busca:** la descripción y la categoría (también "Sin categoría"), al comienzo de una palabra
    y sin importar mayúsculas, tildes ni espacios de más (`src/modules/transactions/search.ts`, con la
    misma regla que las sugerencias). "claro" trae "Claro Hogar"; "deu", los de Deudas. La parte que
    coincide va marcada.
  - **El título** dice cuántos coinciden de cuántos ("3 de 36 movimientos en septiembre") y cuánto
    suman. El total grande de arriba sigue siendo el del mes.
  - **Sin resultados** lo dice, con un botón para borrar la búsqueda. La ✕ y Escape también la borran,
    y Enter cierra el teclado del celular.
  - **En el navegador:** filtra los movimientos del mes que ya llegaron (hasta 500), así que no
    consulta la base ni agrega rutas. La búsqueda no se guarda en la URL: al cambiar de mes o de
    página vuelve a empezar, y sigue al borrar un movimiento.
- **Gastos por categoría en el Resumen:** una dona con el total de egresos del mes al centro y, al
  lado o debajo, la lista con el color, el monto y el porcentaje de cada categoría
  (`src/app/[lang]/(app)/dashboard/category-chart.tsx`).
  - **Las tajadas** (`src/modules/transactions/category-chart.ts`): de la más grande a la más chica,
    hasta 7 con su color. Las de menos del 3% (y las que no alcanzaron color) van juntas en una gris,
    "3 más", con cada una listada debajo. Si solo quedaría una junta, va sola con su color.
  - **Los colores** van por puesto, no por categoría (`--chart-1` a `--chart-7` y `--chart-rest`, en
    `globals.css`): nunca se repiten en una misma dona. Cada uno tiene al menos 3:1 contra la tarjeta,
    en los dos modos (`src/color-contrast.test.ts`).
  - **Tocar** una fila de la lista o una tajada la resalta (más gruesa, y las demás apagadas); otra vez,
    lo quita. La dona es decorativa: el lector de pantalla lee la lista, que dice lo mismo.
- **Fijos** (`/gastos-fijos`, la pestaña entre Egresos y Reportes; `src/app/[lang]/(app)/gastos-fijos/`,
  con la lógica en `src/modules/reports/`): los gastos que se repiten cada mes, con los últimos 12
  meses (sin elegir período: los gastos fijos son de ahora; "En 4 de 12 meses"). Antes eran una
  sección de Reportes; ahí ya no se muestran (tampoco en el PDF), pero se siguen descontando de los
  gastos más grandes y del gasto por día.
  - **Qué cuenta como fijo** (`src/modules/reports/recurring.ts`): los egresos con la misma
    descripción (sin importar mayúsculas, tildes ni espacios) en al menos 3 de los últimos 4 meses (el admin lo
    cambia en Configuración → Valores de la app), y no más de 2 veces en ninguno de ellos:
    "Almuerzo" o "Taxi" se repiten todos los meses, pero muchas veces, y no son fijos. Cada uno con lo
    que sumó el último de esos meses en que apareció, el total al mes y qué parte del gasto promedio
    es. Se detectan solos, y también se marcan a mano (`fixed-choices.ts`, tabla `fixed_expense_choice`):
    ✕ quita uno detectado (queda en "Quitados", de donde vuelve con "Volver a poner") o saca uno
    agregado, y "Agregar un gasto fijo" suma uno de los egresos de los últimos 12 meses. Cada marca
    vale también para lo que Reportes descuenta.
  - **Historial de cada gasto fijo** (`history.ts`, `history-notes.ts`): al tocar uno se abre su
    historial de todo el tiempo, que sale de los movimientos. Cada mes en que su total fue distinto al
    del último mes en que apareció es un cambio: el valor anterior, el nuevo, la diferencia en plata y
    en porcentaje y la fecha del primer pago con el valor nuevo; el primer pago es el punto de partida.
    Cerrado, cada gasto dice su último cambio ("11% desde marzo"). A cada cambio se le puede escribir
    una nota (hasta 280 caracteres; tabla `fixed_expense_note`), solo de un mes en que la persona pagó
    ese gasto; vaciarla la borra.
  - **El estado de este mes** (`fixed-month.ts`): arriba, "5 de 8 pagados este mes" y "Faltan $X" ("Todos
    pagados este mes" si no falta ninguno), y en cada gasto, "Pagado el 4 de oct." (con ✓), "Falta · lo sueles pagar el 22",
    "Atrasado · …" (en rojo) o "No aplica este mes" (marcado "Este pago ya no aplica"). Sale del mismo calendario
    de pagos que los avisos de próximos pagos (`paymentSchedules`, en `upcoming.ts`): lo que falta es lo mismo que
    resta "Lo que te queda". Un gasto sin pago esperado este mes (empezó a pagarse después) no dice nada.
- **Configuración** (`/configuracion`, en el menú de la cuenta, entre Mi cuenta y Ayuda): cómo funciona la app para
  la persona, con un índice arriba y una tarjeta por sección: Presupuestos, Notificaciones, Apariencia e Idioma. Lo que
  se agregue después (la moneda, el recordatorio de registro, las categorías propias) va ahí como otra sección. **Mi
  cuenta** se queda con quién es y su seguridad: sus datos, la contraseña, WhatsApp y eliminar la cuenta (decisión
  del dueño). Mi cuenta tiene un enlace a Configuración para quien busque ahí lo que se movió.
- **Presupuestos** (Configuración → Presupuestos, `src/modules/budgets/`, tabla `category_budget`): un monto por mes
  para una categoría de egresos, el mismo cada mes hasta que la persona lo cambie o lo quite (decisiones del dueño).
  Se llega también desde el Resumen; `/presupuestos`, la dirección de antes, redirige ahí (`next.config.ts`).
  - **La sección:** cómo va cada uno en el mes en curso, "Agregar un presupuesto" (con las categorías de egresos
    disponibles que todavía no tienen), "Cambiar" (el monto) y "Quitar". Uno nuevo solo con una categoría que la
    persona puede ver y no está archivada; el de una que el admin archivó se puede cambiar. Si el admin elimina la
    categoría, el presupuesto se va con ella (cascada).
  - **En el Resumen**, solo con el mes en curso: una barra por presupuesto, de la categoría más cerca del límite (o
    más pasada) a la más lejos, con "Te quedan…" o "Te pasaste por…" (en rojo). Desde el 80 % (`NEAR_SHARE`; el
    admin lo cambia en Configuración → Valores de la app) resalta la línea. Sin presupuestos, un enlace en "Egresos por categoría" invita a ponerlos.
  - Cuenta lo gastado en la categoría en el mes (sin los borrados); los movimientos sin categoría no suman a ninguno.
  - **Los avisos** (`budgetCrossings`, `getBudgetCrossings`): cuando un egreso del mes en curso hace llegar una
    categoría al 80 % (o el de Valores de la app) o pasarse, una vez (si cruza los dos de una vez, solo el de pasarse). No se guarda qué se
    avisó: avisa el egreso que cruza el umbral (antes, por debajo; con él, por encima), así que lo que ya estaba
    cerca o pasado no vuelve a avisar. Llegan:
    - en la respuesta del bot al registrar, entre lo registrado y el balance ("⚠️ Mercado: llevas…", "🚨 …te
      pasaste del presupuesto por…"), sin plantillas de Meta: va dentro de la conversación que abrió la persona
      (decisión del dueño). Un mensaje que Meta reenvía no guarda nada, así que no avisa dos veces;
    - en Egresos, debajo del formulario, a la vista hasta el siguiente registro (un aviso emergente se iría
      solo), con "Ver presupuestos". "Registrar pago" (los próximos pagos) no avisa: la tarjeta del Resumen ya lo
      muestra al lado.
- **Lo que te queda este mes** (`src/modules/reports/remaining.ts`, `month-remaining.tsx`): en el Resumen, solo
  con el mes en curso y si ya hubo ingresos (antes del sueldo todo saldría negativo).
  - **Lo libre:** ingresos − egresos − los gastos fijos que faltan por pagar este mes (sin pagar ni marcados "ya
    no aplica", aunque los avisos estén apagados), y cuánto da por día en los que quedan, contando hoy. Se resta
    solo lo fijo; el gasto variable que viene es una estimación y va en la proyección (decisión del dueño).
  - **La proyección**, desde el día 7 (`PROJECTION_FROM_DAY`): los egresos de hasta hoy, más los fijos que
    faltan, más el gasto variable de cada día (los egresos que no son de gastos fijos) en los días que quedan;
    y lo que sobraría o faltaría. Las estimaciones van a la centena.
  - Los datos de los gastos fijos los comparte con los avisos (`getFixedPaymentsData`, con `cache`).
- **El dato del mes** (`src/modules/reports/month-fact.ts`, `getMonthFact`): debajo de "Egresos por categoría",
  solo con el mes en curso. La categoría de egresos que más se salió de lo normal: lo que lleva del 1 a hoy frente
  al promedio de lo que llevaba del 1 al mismo día en los 3 meses anteriores con movimientos (si no hay ninguno, no
  sale), sin los gastos fijos (pagar el arriendo un día antes no es un cambio de hábito). Sale la que más subió en
  plata, con al menos 20 % y $20.000 de diferencia (así $5.000 → $20.000 no es "300 % más"), o, si ninguna subió,
  la que más bajó; también una categoría nueva o una sin gastos este mes (decisiones del dueño). "Ver en Reportes"
  lleva a sus categorías (`#categorias`; `ScrollToHash` baja hasta ahí cuando la sección llega).
- **El recordatorio de registro** (`src/modules/reminders/`, `dashboard/register-reminder.tsx`): si la persona
  lleva 3 días o más sin registrar nada, en el Resumen (solo con el mes en curso) y en la campana: "Llevas 4 días sin
  registrar nada." (o "Todavía no registras ningún movimiento.") con "Registrar un egreso" y, con WhatsApp
  vinculado, "Escribirle al bot". Cuenta desde el día (en su zona) en que registró su último movimiento, por la
  web o por WhatsApp y sin los eliminados, o, si nunca registró, desde que creó la cuenta. Solo en la web
  (decisión del dueño: por WhatsApp haría falta una plantilla de Meta, que se cobra por mensaje). Marcarlo leído
  en la campana lo saca hasta el próximo hueco (el id lleva el día desde el que cuenta).
  - **Configuración → Recordatorio de registro** (`reminder-settings.tsx`, tabla `reminder_setting`, una fila
    por cuenta que lo cambió): prenderlo o apagarlo y después de cuántos días sin registrar, de 1 a 14. Funciona
    como Notificaciones: se guarda con el botón; apagado, los días se conservan. Va en su propia tabla para que
    guardarlo no fije los avisos de próximos pagos (que siguen los Valores de la app mientras la persona no los
    cambie).
- **Próximos pagos en el Resumen** (`src/modules/reports/upcoming.ts`, `upcoming-payments.tsx`): los gastos
  fijos que tocan en los próximos días (3 si la persona no lo cambió) y los atrasados, del más viejo al
  más próximo. Solo en el mes actual y solo si hay alguno; los primeros 5 y el resto con "Mostrar más".
  - **Registrar pago** (`fixed-payments.ts`): cada aviso abre una ventana (`src/components/dialog.tsx`) con
    el monto del último pago y la fecha de hoy, los dos editables (la fecha, nunca después de hoy: también
    lo revisa el servidor). La descripción y la categoría son las del último pago de ese gasto, y las busca
    el servidor entre los egresos de la persona (nunca las manda el navegador); si la categoría se archivó,
    va sin categoría. Se registra como cualquier egreso web, con las mismas validaciones, y el aviso
    desaparece (ese mes ya está pagado).
  - **La campana** (`notification-bell.tsx`, `user-notifications.tsx`, `src/modules/notifications/`): arriba,
    junto al menú de la cuenta, en todas las páginas. El número en rojo cuenta las notificaciones sin leer:
    el recordatorio de registro (primero) y los avisos de próximos pagos, cada una con su tipo en el id
    (`registro|YYYY-MM-DD`, `pago|YYYY-MM|<clave>`); a los admins, antes, las alertas del bot (`bot|<tipo>|<fecha>`,
    ver Bot de WhatsApp → Alertas del bot). La lista trae los mismos avisos con "Registrar pago",
    "Este pago ya no aplica" y "Marcar como leída" (o "Marcar todas como leídas"), que la saca de la campana
    (tabla `notification_read`) pero el aviso sigue en el Resumen. Se cierra con Escape, al tocar fuera o al
    salir con Tab, como el menú de la cuenta. "Ver los próximos pagos en el Resumen", solo con esos avisos
    prendidos; con ellos y el recordatorio apagados (y, para un admin, sin alertas del bot), no hay campana.
  - **Configuración → Notificaciones** (`notification-settings.tsx`, `upcoming-settings.ts`, tabla
    `notification_setting`): prenderlos o apagarlos (apagados no se avisa nada, tampoco los atrasados) y
    con cuántos días de anticipación, de 0 (el mismo día) a 10, en un campo numérico con su error en
    español debajo. Se guarda con el botón; apagados, el campo queda inactivo y los días se conservan.
    Sin guardar nada: los de Valores de la app (si el admin no los cambió, prendidos, con 3 días). Vale en todos
    los dispositivos.
  - **La fecha esperada:** la mediana de los días del mes de los últimos 3 pagos (resiste uno fuera de lo
    normal: el 5, el 5 y el 20 dan el 5); con menos pagos, con los que haya y "aprox.". Un 31 en un mes
    más corto es su último día, y los pagos alrededor del cambio de mes (el 30, el 31, el 1) van juntos.
  - **Pagado o no:** cada pago cuenta para la fecha esperada más cercana (a menos de medio mes), así que
    el arriendo de octubre pagado el 2 de noviembre cuenta para octubre. El monto es el del último mes.
  - **Atrasados:** los que no tienen pago, hasta 3 meses atrás (`MONTHS_BACK`), en rojo. "Este pago ya no
    aplica" oculta solo el de ese mes (tabla `fixed_payment_skip`); para no avisar más de un gasto, se
    quita en Fijos.
- **Ayuda** (`/ayuda`, desde el menú de la cuenta, entre Configuración y Salir): cómo usar la app por temas
  que se abren (registrar movimientos, el bot de WhatsApp, gastos fijos y avisos, reportes y descargas,
  tu cuenta y tus datos). Los números salen de las constantes de la app y los comandos del bot, de la
  misma lista que su respuesta a "ayuda" (`src/modules/bot/help.ts`): si algo cambia, la ayuda también.
  Con sesión y sin contacto, por ahora.
- **Reportes** (`/reportes`, la quinta pestaña; `src/modules/reports/`).
  - **El período, en la URL:** sin parámetro, los últimos 12 meses contando el actual; con
    `?periodo=2025`, ese año (el año en curso llega hasta el mes actual). Hay un chip por cada año con
    movimientos. Un período mal escrito o futuro muestra los 12 meses. La pestaña no lleva el `?mes=`
    de las otras.
  - **Las cifras del período:** ingresos, egresos, el balance con qué parte de los ingresos se ahorró,
    el gasto promedio por mes y el mes de más gasto. El promedio usa solo los meses completos (el
    actual va en curso y lo bajaría) desde el primero en que la persona registró algo (antes no usaba
    la app).
  - **Ingresos y egresos por mes:** dos barras por mes, en el verde y el naranja de toda la app (no la
    paleta de la dona: aquí el color dice ingreso o egreso). Cada mes es un enlace a su Resumen, que el
    lector de pantalla lee con sus tres montos; con el mouse o con Tab, el detalle aparece debajo. "Ver
    mes a mes" abre la tabla con el balance de cada mes. Los meses cortos ("sept") salen de una tabla
    fija, como las fechas cortas: el gráfico se dibuja también en el navegador.
  - **Gastos por categoría:** el total y la parte de cada una en el período, con la paleta de la dona
    por puesto. Y cómo le fue en el **último mes completo** frente a su promedio de los 3 anteriores
    con movimientos ("En septiembre, 40% más que su promedio"; "Nueva en…" o "Sin gastos en…" si en
    uno de los dos no hubo). Esos meses pueden quedar antes del período.
  - **Los gastos más grandes** (`biggest.ts`): los 10 egresos más altos del período (con "Ver los N
    siguientes", hasta 25), **sin los gastos fijos**: si no, el arriendo llenaría la lista todos los
    meses y taparía lo que sorprende. Cada uno con su fecha (con el año si no es el actual), su
    categoría y su monto; tocarlo lleva a editarlo y, al guardar, se vuelve a Egresos, al mes del
    movimiento (como desde cualquier lista).
  - **¿Qué días gastas más?** (`daily.ts`, `daily-spending.tsx`): lo que se gastó cada día del período,
    **sin los gastos fijos** (si no, el día del arriendo opaca todo lo demás).
    - **El calendario de un mes** (`?calendario=2026-09`, uno del período; sin el parámetro, el último): cada
      día con un tono del naranja de los egresos según su puesto entre los días con gastos del período
      (el cuarto más alto, el más oscuro; así una compra enorme no deja todo lo demás en el más claro).
      Se abre en el día de más gasto; tocar otro muestra su total y sus egresos, que se tocan para
      editarlos. El lector de pantalla lee el día de la semana y el total de cada día.
    - **Por día de la semana:** el promedio de cada uno, contando los días sin gastos (desde el comienzo
      del período o el primer mes con movimientos hasta hoy), con el de más gasto en una frase.
    - **Por quincena:** qué parte cae del 1 al 15 y del 16 al fin de mes.
  - **Descargar movimientos (CSV)** (`src/app/[lang]/(app)/reportes/exportar/route.ts`, `csv.ts`): los
    movimientos del período (el mismo `?periodo=`), en orden de fecha, para abrir con doble clic en el
    Excel en español (y en Google Sheets).
    - **Columnas:** Fecha (`AAAA-MM-DD`), Tipo, Descripción, Categoría, Monto y Origen (Web o WhatsApp).
    - **Formato:** separado por `;`, el monto con coma decimal y sin puntos de miles (los egresos,
      negativos: sumar la columna da el balance), con BOM para que Excel lea las tildes, y saltos de
      línea de Windows.
    - **Seguridad:** un texto que empieza con `=`, `+`, `-` o `@` lleva un apóstrofo adelante, para que
      Excel no lo ejecute como fórmula. Va con `Cache-Control: no-store`. El enlace aparece solo si el
      período tiene movimientos. Sin sesión, al login.
  - **Reporte (PDF)** (`src/app/[lang]/(app)/reportes/pdf/route.ts`, `src/modules/reports/pdf/`): lo mismo que
    muestra la página para el período (el mismo `?periodo=`), en un PDF tamaño carta para guardar o
    imprimir, siempre en el modo claro.
    - **Hoja 1:** las cinco cifras, el gráfico de ingresos y egresos y la tabla mes a mes. **Hoja 2:** las
      categorías a la izquierda; los 10 gastos más grandes y los promedios por día de la semana y por
      quincena a la derecha. Como la página, sin los gastos fijos (tienen su pestaña). Sin el calendario (en papel serían 12) ni la lista de
      movimientos (para eso está el CSV). Si el detalle no cabe, sigue en otra hoja.
    - **Cómo se arma:** `view.ts` arma todos los textos (con las mismas funciones que la página) y
      `document.tsx` los acomoda con `@react-pdf/renderer`, en el servidor. Las categorías van con un
      punto de su color en vez del emoji, y los colores están copiados del modo claro de `globals.css`
      (`colors.test.ts` revisa que coincidan).
    - **Fuente:** Geist (la de la app; `fonts/`, licencia OFL), incrustada porque la estándar de los PDF
      no tiene el signo menos (−) ni las flechas. Se lee del disco: `next.config.ts` la incluye en la
      función de la ruta en Vercel (`outputFileTracingIncludes`).
    - Va con `Cache-Control: no-store` y el nombre de la persona (no su correo). Sin sesión, al login.
  - **Privacidad:** solo los movimientos propios y no eliminados (pruebas de integración con dos
    usuarios). No guarda nada nuevo: todo se calcula al abrir la página o al descargar.
- **Todas las consultas filtran por `userId`** obtenido de la sesión en el servidor; cada Server
  Action vuelve a validar la sesión.
- **Borrado lógico** (`deleted_at`): permite deshacer.
  - **En el bot:** `deshacer` borra el último movimiento registrado.
  - **En la web:** al borrar un movimiento de Ingresos o Egresos aparece el aviso emergente rojo "Se borró… · Deshacer", que dura 10 segundos y recibe el foco. Lo pide la URL (`?borrado=<id>`): el servidor busca la descripción solo si el movimiento es de la persona, y la app quita el parámetro al mostrarlo.
  - **Límite:** `restoreTransactionAction` solo restaura un movimiento propio borrado hace menos de 10 minutos (`UNDO_WINDOW_MS`). Después queda borrado hasta que la limpieza diaria lo elimina del todo.
- **Avisos emergentes** (`src/components/toaster.tsx`, con `useToast()`): la confirmación de algo que ya pasó, en toda la app.
  - **Colores:** verde (`success`) para lo que se guardó o se activó; rojo (`removal`) para lo que se borró o se desactivó.
  - **Dónde y cuánto:** abajo al centro en celular y tableta, y abajo a la derecha en computador, como máximo 3 a la vez.
    - Duran 4 segundos, o 10 los que tienen un botón ("Deshacer").
    - Se pausan con el mouse encima, al tocarlos o con el foco del teclado.
    - Se cierran con la X.
  - **Accesibilidad:** el lector de pantalla los anuncia (una región `aria-live` que existe siempre). Los que siguen a una ventana que se cerró, o a una fila que ya no está, reciben el foco; al cerrarse, el foco vuelve a `#contenido`.
  - **Después de una redirección del servidor:** la URL lleva un código fijo (`?aviso=guardado`, `src/lib/toasts.ts`), nunca datos de la persona. Cada código vale solo en las páginas adonde redirige su acción, para que un enlace no pueda inventar un aviso.
  - **No son avisos emergentes:**
    - los errores, que se quedan junto a su campo;
    - los resultados que se consultan ("Probar conexiones", el código para vincular WhatsApp);
    - el paso a paso de la verificación en dos pasos.
- **`transaction.external_id` único**: guardará el ID del mensaje de WhatsApp para no registrar
  dos veces el mismo gasto si Meta reenvía el webhook.

## Bot de WhatsApp

1. En **Mi cuenta**, la tarjeta **WhatsApp → Conectar WhatsApp** genera un código de 6 dígitos
   (vence en 10 minutos). El usuario lo envía al bot como `VINCULAR 123456` y su número queda
   asociado a su cuenta. Mientras no lo tenga vinculado, el Resumen muestra un aviso corto que lleva
   ahí (`/cuenta#whatsapp`, `src/app/[lang]/(app)/dashboard/whatsapp-hint.tsx`); ya vinculado, el Resumen no
   muestra nada de WhatsApp. A un número sin vincular, el bot le responde con ese mismo enlace.
2. Cada mensaje llega a `POST /api/whatsapp/webhook`. Se verifica la firma `X-Hub-Signature-256`,
   se responde 200 de inmediato y el mensaje se procesa después (`after()`).
3. Se deduplica por el ID del mensaje, se resuelven los comandos fijos (`balance`, `reporte`,
   `deshacer`, `ayuda`) y el texto libre se interpreta con Claude. El bot responde por WhatsApp.

**La descripción del historial** (`src/modules/bot/history-match.ts` y `history.ts`): antes de guardar lo
que entendió Claude, el bot busca en el historial de la persona (del mismo tipo, sin lo eliminado, de los
últimos 12 meses) la descripción que ya usa, y guarda esa con la categoría de la última vez (si sigue
disponible; si no, la de Claude). La respuesta muestra lo que quedó guardado.
- **Cómo compara:** palabra por palabra, en el servidor (no le manda el historial a Claude ni gasta
  tokens), sin tildes, mayúsculas ni palabras como "de" o "la". Todas las palabras de lo que escribió
  tienen que estar en la del historial, iguales, al comienzo de una ("net" → "netflix") o, con cuatro
  letras o más, dentro de una ("pago" → "postpago"): "pago claro amor" se guarda como "Claro Postpago
  Cata Amor".
- **Con una sola palabra,** solo la que es igual ("almuerzo" → "Almuerzo"), nunca una más larga
  ("Almuerzo con Ana").
- **Entre varias,** la que tiene exactamente sus palabras y, si no, la más usada; si empatan, se deja la
  de Claude. Sin sinónimos, a propósito ("internet de la casa" no es "Claro Hogar").

**Balance de otro mes** (`src/modules/bot/commands.ts`): un comando fijo más, sin Claude (no gasta
tokens y funciona con Claude en pausa).
- **Qué entiende:**
  - `balance septiembre`, `saldo de agosto`, `resumen del mes de marzo`;
  - abreviado (`balance sept`) o con año (`balance septiembre 2025`);
  - `balance mes pasado`;
  - en pregunta, para un mes, el mes pasado o este: `¿cuánto gasté en septiembre?`, `¿cuántos fueron
    mis ingresos en septiembre?`, `¿cuánto gané el mes pasado?`, `mis gastos de agosto`, `¿cómo me fue
    en marzo?` (`ASK_*`). Los totales solos ("mis gastos") no cuentan: podrían ser otra cosa.
- **Lo que se escapa de esas reglas** lo responde Claude. Si es una pregunta por saldos o totales
  (por ejemplo "¿cuánto he gastado en comida?"), su prompt le pide no calcular cifras y decir que
  escriba *balance* o *balance septiembre*. Lo prueban 3 casos de `pnpm bot:eval`.
- **Qué mes es** (`balanceMonth`): sin año, el último que ya pasó con ese nombre (en octubre,
  "noviembre" es el del año pasado). Uno que todavía no llega lo dice.
- **La respuesta,** como la de `balance`, suma una línea con cómo cambió el balance frente al mes
  anterior ("↗ $1.803.978,75 más que agosto"), si ese mes tuvo movimientos. El `balance` de siempre
  también la lleva.

**Reporte** (`reporte`, en `src/modules/bot/commands.ts`): lo de Reportes de la web en un mensaje, sin
Claude (no gasta tokens y funciona con Claude en pausa), con las mismas consultas y cálculos
(`getReport`, `src/modules/reports/`).
- **Qué entiende:**
  - `reporte` o `informe` (también `mi reporte`, `reporte de los últimos 12 meses`): los últimos 12 meses;
  - con año, `reporte 2025`, `informe del 2025` o `reporte del año 2025`;
  - el año en curso: `reporte del año`, `reporte de este año` o `informe anual`;
  - un año que todavía no llega, o de antes del 2000, lo dice sin consultar nada.

  "Resumen" sigue siendo el balance del mes. Lo demás ("reporte de gastos", "reporte del mes") va a Claude.
- **La respuesta:** ingresos, egresos y balance (con qué parte de los ingresos se ahorró), el gasto
  promedio por mes, el mes de más gasto, las 3 categorías que más sumaron, el total de los gastos
  fijos y el enlace a Reportes (con `?periodo=` si es un año). Sin movimientos en el período, lo dice.
- **El prompt de Claude no cambió:** el comando se resuelve antes de llegar a él. Por eso no hizo falta
  `pnpm bot:eval`.

**Límites** (`src/modules/bot/limits.ts`): cada mensaje interpretado es una llamada a Claude con
costo, y la vinculación por código no debe poder adivinarse.
- **Mensajes interpretados por cuenta:**
  - máximo 20 por hora y 100 por día (`src/modules/bot/ai-quota.ts`);
  - antes de llamar a Claude se reserva el cupo marcando el mensaje (`ai_requested_at`), en una
    transacción corta con un bloqueo por cuenta, así una ráfaga simultánea no supera el tope;
  - al pasarlo, el bot avisa y los comandos (`balance`, `reporte`, `deshacer`, `ayuda`) siguen funcionando.
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
| **`pnpm audit`** (job de CI) | Vulnerabilidades conocidas en todas las dependencias (también las de desarrollo; las ignoradas, con su porqué en "Versiones forzadas de dependencias") | Cada PR y push | Sí, si son altas o críticas. Si el registro de npm no responde, solo si cambió `pnpm-lock.yaml` (ver "Riesgos aceptados") |
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
| **El rol de admin se da y se quita desde la app** (solo el super admin, en Usuarios) | Antes solo desde la terminal; el dueño lo pidió para no depender de la `DATABASE_URL`. Lo hace una sola cuenta (el super admin, marcado solo desde la terminal), con su código de Google Authenticator, y queda en el historial. Dar el rol cierra las sesiones de la persona y le exige la verificación en dos pasos para administrar; nadie le quita el rol al super admin desde la app | Hubiera más de una persona de confianza que necesite dar roles, o se agreguen roles con más permisos |
| **Categorías: crear, renombrar y restaurar no piden el código** de Google Authenticator; archivar y eliminar sí (#50) | Son cambios que se ven de inmediato y se deshacen con otro cambio. Cada uno queda en `category_change` con el admin, y la sesión de admin ya exige los dos pasos al entrar | Las categorías empezaran a afectar algo más que el nombre y el emoji (por ejemplo, reglas del bot) |
| **Registros: invitar y quitar un correo no piden el código** de Google Authenticator; cambiar quién puede crear una cuenta sí | Como crear categorías (#50): se ve de inmediato y se deshace con otro cambio. Una invitación solo sirve con los registros "solo con invitación" y para crear una cuenta común (nunca de admin). Cada cambio queda en el historial con el admin, y la sesión de admin ya exige los dos pasos al entrar. La invitación es el correo, no un enlace secreto: como la app no verifica correos, quien sepa un correo invitado podría registrarse antes con él (sería una cuenta común, y la persona invitada lo notaría al registrarse) | Una invitación diera algo más que crear una cuenta común (un rol, otra moneda, beneficios), o se agregue la verificación del correo |
| **Eliminar una cuenta reinicia el contador de intentos de vinculación de su número** | Conservar esos intentos contradiría "al eliminar la cuenta se borra su historial". Aprovecharlo exige registrarse y vincular el número cada 5 intentos, contra un millón de códigos que viven 10 minutos | Se agregue un contador sin datos personales (por ejemplo, el número con hash, por una hora) |
| **Si el registro de npm no responde, la auditoría de dependencias deja un aviso y el CI sigue**, solo si `pnpm-lock.yaml` no cambió (`scripts/dependency-audit.mjs`) | Un timeout del registro frenó el despliegue de #176 sin ninguna vulnerabilidad de por medio. Esas dependencias ya pasaron la auditoría: en un PR, las de la base; en `main`, las del PR, que la regla "Proteger main" exige al día. Lo único que se atrasa es ver un aviso publicado después: lo muestran la próxima corrida y Dependabot. Si el lockfile cambió, o no se puede comparar (con "Run workflow"), falla como ante una vulnerabilidad | El aviso amarillo apareciera en varias corridas seguidas (días sin auditar) |
| **El filtro de enlaces de las respuestas del bot usa una lista de terminaciones** (`.com`, `.co`, `.net`…) | Una terminación rara pasaría, pero la respuesta solo le llega a quien escribió, y además tiene largo máximo | Hubiera respuestas reales con enlaces de otra terminación |
| **El CLI de Vercel del despliegue trae 20 avisos sin versión corregida en su rama** (`.github/vercel-cli/`): 17 de `undici` 5.x, 2 de `@fastify/busboy` 2.x (llega con `undici` 5) y 1 de `zod` 3.x | El CLI usa `undici` 5 como cliente HTTP solo contra la API de Vercel, por HTTPS. Los avisos requieren que un servidor malicioso responda (también los dos de TLS de octubre de 2026: una renegociación de TLS 1.2 que tumba el proceso, y callbacks propios de TLS, que el CLI no usa), WebSockets (el despliegue no los usa), o encabezados o cuerpos que controle un atacante (son fijos nuestros). `zod` 3 solo valida el resumen de compilación de los "backends" de Vercel (Express y similares, que este proyecto no usa), nunca datos de afuera; su arreglo solo existe en `zod` 4 y el CLI más nuevo sigue en `zod` 3. Los demás avisos se corrigieron con overrides (ver "Versiones forzadas de dependencias") | Una versión del CLI pase a `undici` 6 o más, o a `zod` 4 (Dependabot la propone) |

**Analítica y velocidad:** [Vercel Web Analytics](https://vercel.com/docs/analytics) y
[Speed Insights](https://vercel.com/docs/speed-insights) (`<Analytics />` y `<SpeedInsights />` en
`src/app/[lang]/layout.tsx`, activadas en Vercel). Son anónimas y sin cookies, y están explicadas en
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

Hay dos roles (`src/lib/roles.ts`), guardados en la columna `user.role`, y un admin especial, el
**super admin**:

| Rol | Quién | Qué ve |
|---|---|---|
| `user` | Toda cuenta al registrarse | Resumen, Ingresos, Egresos, Fijos, Reportes, Mi cuenta y Configuración |
| `admin` | Quien recibe el rol del super admin (en Usuarios) o desde la terminal | Todo lo de `user` y la sección de administración (pestaña **Admin**), con verificación en dos pasos obligatoria. Su etiqueta va en violeta |
| super admin | Un admin con la marca `user.super_admin`: uno solo, puesto solo desde la terminal (`pnpm admin:super`) | Todo lo de `admin` y, además, dar y quitar el rol de admin en Usuarios. Su etiqueta ("Super admin") y su escudo van en dorado |

- **No hay usuario ni contraseña de admin por defecto.** El rol se le da a una cuenta que ya
  existe: desde la terminal, solo puede hacerlo quien tiene la `DATABASE_URL`; desde la app, solo
  el super admin, con su código de Google Authenticator. Así no queda nada en el código (el
  repositorio es público) ni en Vercel.
- **El super admin** (`isSuperAdmin` en `src/lib/roles.ts`, `requireSuperAdmin()` en
  `src/lib/session.ts`): la marca sola no alcanza, también tiene que ser admin. La base admite uno solo
  (índice único `user_one_super_admin_idx`) y la app no la puede poner ni quitar (`input: false`, como el
  rol): `pnpm admin:super <correo>` se la pasa a otro admin (dos a la vez quedan en fila, con un candado de
  Postgres), y `pnpm admin:revoke` se la quita junto con el rol. Desde la app nadie le quita el rol: la
  acción no aparece en su ficha y el servidor lo rechaza.
- **Dar el rol** (en la app o con `admin:grant`) cierra sus sesiones: al volver a entrar, después de la
  contraseña va directo a configurar la verificación en dos pasos (`afterLoginPath`). **Quitarlo** (en la
  app o con `admin:revoke`) borra su verificación y sus códigos de respaldo y cierra sus sesiones: vuelve
  a entrar solo con su contraseña. Sus finanzas no se tocan. Las dos cosas hacen lo mismo en los dos
  lados (`src/modules/account/admin-role.ts`); desde la app, además, quedan en el historial.
- **Nadie puede darse el rol a sí mismo:** en Better Auth el campo tiene `input: false`, así que
  el registro ignora el rol que mande el cliente. "Actualizar perfil" está apagado por HTTP y, si se
  usara desde el servidor, también lo rechaza (`FIELD_NOT_ALLOWED`). La base solo acepta `user` o
  `admin` (tipo `user_role`). No se usa el plugin `admin` de Better Auth: agregaría endpoints
  (suplantar usuarios, cambiar contraseñas ajenas) que no hacen falta.
- **En el servidor:** las páginas y acciones de administración llaman a `requireAdmin()`
  (`src/lib/session.ts`): sin sesión llevan al login, sin el rol responden 404 (para no revelar que
  la sección existe) y sin la verificación en dos pasos llevan a configurarla. Dar y quitar el rol de
  admin usa `requireSuperAdmin()` (lo mismo y, además, ser el super admin; a otro admin le responde
  404). El rol se lee de la base en cada pedido. Solo la página donde se configura
  la verificación usa `requireAdminRole()` (el rol sin la verificación). La matriz de autorización
  falla si una página o acción de admin no los usa así.

**Verificación en dos pasos (solo admins).** Plugin `twoFactor` de Better Auth con Google
Authenticator (o cualquier app TOTP); reglas propias en `src/modules/auth/two-factor-rules.ts`:

- **Configuración, una vez** (`/admin/seguridad`, adonde lleva el login a un admin que todavía no la
  tiene, y la pestaña Admin si falta):
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
  (en una redirección a la misma dirección, no en la respuesta que arma el login: ahí Next repetía las
  cookies sin borrarlas) y el login avisa "Tu sesión se cerró" (`src/lib/expired-session.ts`); sin eso,
  el proxy y el dashboard se mandaban el uno al otro sin fin.

**Hacerse admin** (en la terminal, dentro de la carpeta del proyecto, con la cuenta ya registrada en
la app):

1. Copia la `DATABASE_URL` de producción de Neon (*Dashboard → Connect*) en un archivo
   `.env.produccion`: una sola línea `DATABASE_URL=...`. Git ignora los `.env*`.
2. Corre `pnpm admin:grant --env .env.produccion tu-correo@...` y escribe el correo para confirmar.
3. Borra el archivo: `rm .env.produccion`.

`pnpm admin:list --env .env.produccion` muestra quiénes son admin (si tienen la verificación en dos
pasos activa y quién es el super admin) y `pnpm admin:revoke` quita el rol. Sin `--env`, usan la base
local de `.env`. Al volver a entrar después de hacerte admin, la app te lleva a configurar la
verificación en dos pasos.

**Hacerse super admin** (una vez, ya como admin): `pnpm admin:super --env .env.produccion tu-correo@...`
y escribe el correo para confirmar. Si otra cuenta era el super admin, deja de serlo.

### Sección de administración

La pestaña **Admin** (solo para admins) abre `/admin`, organizada en **módulos**. Todos comparten un
marco (`src/app/[lang]/(app)/admin/layout.tsx`): el título y una subnavegación con chips (Inicio y los
módulos activos). **Inicio** muestra una tarjeta por módulo, con un resumen de los activos; los que
vienen (hoy ninguno) aparecen como "Pronto".

La pestaña va siempre en violeta (los colores `admin`) y con el escudo, como la etiqueta y el escudo del
menú de la cuenta (`src/components/admin-badge.tsx`): se distingue de las de todos y avisa que ahí se
actúa con permisos de admin.

| Módulo | Ruta | Estado |
|---|---|---|
| Historial | `/admin/historial` | Activo: registro y vinculación de WhatsApp |
| Usuarios | `/admin/usuarios` | Activo: cuentas, sesiones y estado; desbloquear, cerrar sesiones, desvincular WhatsApp, suspender, reactivar y eliminar |
| Bot de WhatsApp | `/admin/bot` | Activo: qué pasó con los mensajes, consumo de Claude y errores, sin el texto |
| Categorías | `/admin/categorias` | Activo: crear, editar, archivar, restaurar y eliminar las de ingresos y egresos |
| Salud del sistema | `/admin/salud` | Activo: el estado de la app (lo mismo que `/api/health`), la versión, la base, la limpieza diaria, las conexiones del bot y los despliegues recientes |
| Configuración | `/admin/configuracion` | Activo: quién puede crear una cuenta (registros abiertos, cerrados o solo con invitación), los correos invitados, el aviso para todos y los valores de la app (los avisos por defecto y los umbrales) |
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
  chips y las etiquetas de filtros activos (`src/app/[lang]/(app)/admin/chip-filter-bar.tsx` y
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

**Acciones** (en el detalle; solo las que aplican, y nunca en la cuenta propia ni en la de otro admin; en
la de otro admin, el super admin solo puede quitarle el rol):

| Acción | Qué hace | Queda en el historial |
|---|---|---|
| Desbloquear el inicio de sesión | Borra el bloqueo por contraseñas equivocadas (`login_failure`) | `login_unlocked` |
| Cerrar todas sus sesiones | Borra sus sesiones: tiene que volver a entrar. Su WhatsApp sigue | `sessions_revoked` (cuántas) |
| Desvincular su WhatsApp | Lo mismo que hace la persona desde Mi cuenta | `whatsapp_unlinked` con `by_admin` |
| Suspender la cuenta | Hasta que la reactive un admin: cierra sus sesiones, no puede entrar ni usar el bot. Sus datos se conservan. Motivo opcional e interno | `account_suspended` (con el motivo) |
| Reactivar la cuenta | Puede volver a entrar y a usar el bot | `account_reactivated` |
| Eliminar la cuenta | Lo mismo que `pnpm account:delete`; además pide escribir su correo | Solo `account_deleted`, sin datos de la cuenta |
| Darle el rol de admin (solo el super admin; no a una cuenta suspendida) | Cierra sus sesiones: al volver a entrar configura la verificación en dos pasos | `admin_granted` (cuántas sesiones) |
| Quitarle el rol de admin (solo el super admin, a otro admin) | Vuelve a ser usuario: se borran su verificación y sus códigos de respaldo, y se cierran sus sesiones | `admin_revoked` (cuántas sesiones) |

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

- **Alertas del bot:** arriba de esta página y del Inicio del admin, lo que no anda y hay que arreglar,
  con desde cuándo y qué hacer. Salen de lo que ya guarda cada mensaje y de la configuración, sin tabla
  propia, y se apagan solas cuando el problema se resuelve. Las reglas están en
  `src/modules/bot/alert-rules.ts` y la consulta en `src/modules/bot/alerts.ts`.

  | Alerta | Cuándo se prende |
  |---|---|
  | El token de WhatsApp no sirve | El último envío falló con 401 o el código 190 de Meta |
  | WhatsApp no envía | Los últimos 3 envíos fallaron por otra causa. Un número que no puede recibir (fuera de la lista de prueba de Meta) no cuenta |
  | Claude: la API key, el modelo, los créditos o sin configurar | La última llamada falló por esa causa |
  | Claude está fallando | Las últimas 3 llamadas fallaron (sobrecarga, red) |
  | El tope mensual de tokens | Aviso desde el 80 % (en el tono de siempre) y alerta al 100 % |
  | Mensajes sin procesar | Mensajes de las últimas 24 horas que siguen sin procesar a los 10 minutos |

  Las alertas que son fallas, no los avisos, cuentan como un problema en [Salud del sistema](#salud-del-sistema).
  Fuera de la app las vigila [la vigilancia cada hora](#vigilancia-cada-hora).

  También van en **la campana** de quien puede administrar (el rol y la verificación en dos pasos:
  `canAdminister`), en cualquier página y antes que todo, con la etiqueta Admin, qué pasa, desde cuándo y "Ver Bot de
  WhatsApp" (qué hacer queda en el módulo). No se apagan en Configuración (decisión del dueño). "Marcar como leída"
  la saca de la campana hasta que vuelva a pasar: su id lleva el tipo y desde cuándo (`bot|<tipo>|<fecha>`), así que
  una falla que se arregla y vuelve es otra; el tope mensual vuelve el mes siguiente, y los mensajes sin procesar,
  cada día mientras sigan.

- **Configuración** (cada cambio pide el código de Google Authenticator y queda en Historial → Acciones
  del admin, con "Bot de WhatsApp" en vez de una cuenta):

  | Ajuste | Qué hace |
  |---|---|
  | Pausar / reanudar Claude | En pausa, el bot no llama a Claude: a lo escrito libremente responde que lo registren en la web, y *balance*, *deshacer* y *ayuda* siguen. No gasta créditos. Para frenar en segundos si algo sale mal o se dispara el gasto, sin desplegar |
  | Topes por cuenta | Mensajes con Claude por hora y por día (1–200 y 1–2.000, el de la hora no mayor que el del día; `AI_LIMIT_BOUNDS`). Al llegar, el bot pide esperar |
  | Tope mensual de tokens | Tokens de Claude al mes, de todas las cuentas (10.000–100.000.000, o sin tope; `MONTHLY_TOKEN_BOUNDS`). Muestra cuánto va del mes y, con el promedio por mensaje, para cuántos mensajes alcanza. Al llegar, el bot deja de usar Claude hasta el mes siguiente (en hora de Colombia), como en pausa. Es un tope suave: mensajes simultáneos pueden pasarlo un poco (`src/modules/bot/token-budget.ts`) |
  | Modelo de Claude | Uno de la lista de `src/modules/bot/models.ts` (Haiku, Sonnet y Opus 5.5), con lo que acertó cada uno en `pnpm bot:eval` y cuánto cuestan 1.000 mensajes con el promedio de tokens de los de hasta ahora. Sin elección vale `BOT_MODEL` (para comparar en local) o Haiku 5.5. La prueba de conexión de Salud y la vigilancia usan el mismo. Para sumar un modelo: su precio en `pricing.ts`, medirlo con `pnpm bot:eval --model <id>` (cuesta créditos) y anotar el resultado en la lista |

  Se guarda en una sola fila (`bot_setting`); sin ella valen los de siempre: Claude activo y
  `AI_LIMITS` (20 por hora y 100 por día). El bot la lee en cada mensaje que necesitaría a Claude
  (`src/modules/bot/settings.ts`), así que aplica desde el siguiente. Si Claude está en pausa, la
  tarjeta de Inicio lo dice.

  Las conexiones con WhatsApp y Claude se prueban en [Salud del sistema](#salud-del-sistema).
- **Qué pasó con los mensajes:** cuántos llegaron y el resultado de cada uno: registró movimientos,
  comando, respuesta sin registrar nada, vinculó su número, llegó al tope de Claude, Claude en pausa,
  error, código de vinculación inválido, número sin vincular, no era texto, cuenta suspendida o sin
  procesar. Sale del
  estado del mensaje, del tipo de intención y de si el número tiene cuenta. También el tiempo de
  respuesta (mediana y p95). Tocar una barra filtra toda la página por ese resultado (`?resultado=`,
  con su etiqueta y su ✕ en los filtros activos; otra vez, lo quita). Las barras siguen mostrando todos
  los resultados para poder cambiar de uno a otro.
- **Por cuenta:** una fila por cuenta, con los filtros de la página: mensajes, cuántos registraron
  movimientos, tokens de Claude, su costo estimado en dólares, errores y el último mensaje (hoy, ayer o
  la fecha), con enlace a su detalle en Usuarios. Se ordena por tokens (de la que más usa), mensajes,
  errores o el último (`?orden=`); los números que escribieron sin estar vinculados van juntos al
  final. Se ven 50 y "Ver más cuentas" suma de a 50, hasta 500. En celular, cada cifra lleva su nombre a
  la vista; desde `md`, van en columnas. Solo cantidades, nunca el texto.
- **Consumo de Claude:** llamadas, tokens de entrada y salida (los que guarda el bot en cada mensaje,
  con el modelo que respondió) y su **costo estimado en dólares**, por día (con "Todo", los últimos 30
  días) y por modelo, y las cuentas que llegaron al tope.
- **Costo estimado** (`src/modules/bot/pricing.ts`): los tokens de cada mensaje por el precio público
  de su modelo (dólares por millón de tokens, de la [página de precios de
  Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), con la fecha en que se
  revisaron). Haiku 5.5 cobra más las llamadas de más de 100.000 tokens de entrada: se calcula por
  llamada. Se muestra con dos decimales, y "<US$0,01" si no alcanza un centavo. Es un estimado: el cobro
  real está en la consola de Anthropic. **Si cambian los precios o el modelo del bot** (`BOT_MODEL`),
  hay que actualizar la tabla: una prueba exige que el modelo por defecto tenga precio, y un modelo sin
  precio no se inventa (en la cuenta sale "—" y el total lo nombra).
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
| Crear, editar | No | Nombre (hasta 40 caracteres, sin repetir dentro del tipo: no importan mayúsculas ni tildes, ni las archivadas), nombre en inglés (opcional, con las mismas reglas; vacío: en inglés se ve el nombre) y un emoji (vacío es "•") |
| Archivar | Sí | Sale de los formularios y el bot no la usa; los movimientos que ya la tienen la conservan (al editar uno, se sigue ofreciendo marcada "(archivada)") |
| Restaurar | No | Vuelve a los formularios y al bot |
| Eliminar | Sí | Si tiene movimientos, avisa: pasan a "Otros" de su tipo (los de todas las cuentas, también los eliminados), en la misma transacción |

**"Otros"** es la que usa el bot si ninguna encaja: solo se le cambian el emoji y el nombre en inglés (no
se renombra, archiva ni elimina). Cada cambio queda en `category_change` con el admin y el nombre y emoji de ese momento
(así una eliminada se sigue leyendo) y se ve en "Cambios recientes". Las categorías propias de cada
cuenta (`category.user_id`) no se administran aquí.

`scripts/seed.ts` corre en cada despliegue, pero solo crea las categorías por defecto en una base sin
ninguna global: si las creara siempre que faltan, volverían las que el admin renombró o eliminó. Una
categoría nueva para todos se crea desde `/admin/categorias`.

### Salud del sistema

En **`/admin/salud`** el admin ve si la app está bien, sin datos de nadie (nombres de variables, nunca
sus valores; tamaños y cantidades). Se revisa al abrir la página (`src/modules/admin/health/`):

- **Estado:** "Todo en orden" o cuántos problemas, y cada revisión:
  - el healthcheck, lo mismo que responde `/api/health`;
  - las variables de entorno obligatorias (`REQUIRED_ENV`), por nombre;
  - las migraciones (cuántas tiene la base de las del código, y la última);
  - cuánto tarda la base en responder;
  - la última corrida de la limpieza diaria;
  - el bot de WhatsApp: sus [alertas](#bot-de-whatsapp-1) que son fallas.

  Son problemas: una variable que falta, la base sin responder o sin todas las migraciones, la
  limpieza si falló o no corre desde hace más de 26 horas (un día y un margen), y las alertas del bot.
  La tarjeta del Inicio del admin lo muestra como un semáforo, con los mismos problemas.
- **Versión:** el commit desplegado, cuándo se compiló, el entorno, la región de Vercel y la versión de
  Node. El commit y la fecha los fija `next.config.ts` al compilar (`GITHUB_SHA`, que el CI define al
  correr `vercel build`); en un build local no hay commit (`src/lib/build-info.ts`).
- **Base de datos:** la versión de Postgres, cuánto ocupa y cada tabla con sus filas (las que estima
  Postgres) y su tamaño, de la más grande a la más chica.
- **Limpieza diaria:** cuándo corre y sus últimas 7 corridas, con lo que borró o el tipo del error
  (`cron_run`; ver [Borrar datos a pedido](#borrar-datos-a-pedido)).
- **Conexiones:** "Probar conexiones" revisa el token de WhatsApp (lee el nombre, el número y la
  calidad del número del bot en la Graph API; necesita el permiso `whatsapp_business_management`, el
  mismo de `scripts/meta-subscribe.sh`) y la API key de Claude (consulta el modelo del bot en la API de
  modelos), sin enviar mensajes ni gastar créditos. Dice por qué falla (token vencido, un permiso o una
  variable que falta, un modelo que ya no existe) con lo que respondió el servicio, nunca la clave, y
  cuándo llegó el último mensaje al webhook: si Meta dejó de enviar, se nota ahí. Solo lee: no pide el
  código ni queda en el historial.
- **Despliegues recientes:** las últimas 5 releases de GitHub, con sus cambios y la que corre marcada
  (`src/lib/releases.ts`). El repositorio es público: se consultan sin token, y la respuesta se guarda
  10 minutos en la caché de Next (sin token, GitHub deja 60 pedidos por hora). Si GitHub no responde,
  el resto de la página se ve igual, con un enlace a las releases. En las E2E, `GITHUB_API_URL` apunta
  al GitHub falso (`e2e/fake-services.mjs`).

### Configuración de la app

En **`/admin/configuracion`** el admin cambia lo que vale para toda la app (`src/modules/admin/configuracion/`):
los **registros** (quién puede crear una cuenta), el **aviso para todos** y los **valores de la app**. Lo que venga
va aquí como otra tarjeta.

| Registros | Qué pasa en `/registro` |
|---|---|
| **Abiertos** (sin elegir, como siempre) | Cualquiera crea su cuenta |
| **Solo con invitación** | Solo los correos de la lista de invitados (sin importar mayúsculas ni espacios). La página lo avisa |
| **Cerrados** | Nadie crea una cuenta nueva, ni con invitación. La página lo avisa |

- **Dónde se revisa:** en el servidor, en el registro de Better Auth (`src/lib/auth.ts` con
  `src/modules/auth/signup-policy.ts`), no solo en la página: un registro por HTTP (curl) se rechaza
  igual, con el correo de contacto en el mensaje. Las cuentas que ya existen entran como siempre.
- **Cambiar el modo** pide el código de Google Authenticator y queda en el historial con el de antes
  (`app_setting`, una sola fila: sin fila, abiertos).
- **Los invitados** (`signup_invite`): agregarlos y quitarlos no pide el código, pero queda en el
  historial con el admin (ver "Riesgos aceptados"). No se invita un correo que ya tiene cuenta. Al
  registrarse, la invitación queda como usada ("Creó su cuenta el…"); si esa persona elimina su
  cuenta, se borra su invitación y su correo sale de esos eventos ("invitó a alguien").
- **Inicio** muestra cómo están los registros y, solo con invitación, cuántas invitaciones faltan por
  usar; con un aviso vigente, hasta cuándo se ve.

**El aviso para todos** (`app_notice`, una sola fila): un mensaje arriba de la app, del inicio de sesión y
del registro, por ejemplo "Mantenimiento el sábado de 8 a 9" o "Nuevo: presupuestos".
- **Uno a la vez**, de hasta 200 caracteres en una línea, con un texto opcional en inglés (vacío: se ve el de
  español). Es **Información** (en el color de la marca) o **Importante** (en rojo, como las alertas).
- **Se apaga solo** en la fecha y hora de fin, en hora de Colombia, hasta 31 días después. Uno vencido sigue
  en Configuración (en rojo, "Venció el…") hasta que se publique otro o se quite.
- **Publicarlo, cambiarlo y quitarlo** piden el código de Google Authenticator y quedan en el historial con el
  texto, el tipo y la fecha de fin.
- **Se cierra con la ✕** en cada navegador: la cookie `aviso-cerrado` guarda su versión (la fecha en que se
  publicó), así el servidor tampoco lo dibuja al recargar. Si se publica otro, o se cambia el texto, tiene
  otra versión y vuelve a aparecer.
- Lo lee `src/modules/notice/current-notice.ts` en cada pedido (`src/components/site-notice.tsx`, dentro de
  Suspense en los layouts de la app y de entrar), sin sesión.

**Los valores de la app** (`app_values`, una sola fila; sin ella, los de siempre de `src/modules/app-values/values.ts`):

| Valor | De siempre | Rango | A quién le aplica |
|---|---|---|---|
| Avisos de próximos pagos: prendidos y con cuántos días | Prendidos, 3 días | 0 a 10 días | A quien no eligió los suyos en Configuración → Notificaciones (sin fila en `notification_setting`); quien los eligió conserva los suyos |
| Desde qué % un presupuesto "se acerca" | 80 % | 50 a 95 | A todas las cuentas: el Resumen, Configuración, el aviso del formulario y el del bot |
| Cuándo un egreso es fijo: en al menos N de los últimos M meses | 3 de 4 | M de 3 a 6; N de 2 a M | A todas las cuentas: Fijos, Reportes (los descuenta), los próximos pagos y "Lo que te queda" |

- Cambiarlos pide el código de Google Authenticator y queda en el historial con los de antes.
- Los lee `src/modules/app-values/current.ts` (una consulta por pedido, con `cache`), sin sesión: las consultas
  de cada cuenta, el bot y las páginas que los explican (Fijos y la Ayuda).
- La base revisa los rangos (`check`), como el servidor.

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
| `signup_mode_changed`, `signup_invite_added`, `signup_invite_removed` | Acciones del admin en `/admin/configuracion`; sin cuenta | El modo nuevo y el de antes; el correo invitado (sale si esa persona elimina su cuenta) |
| `notice_published`, `notice_removed` | El aviso para todos, en `/admin/configuracion`; sin cuenta | El texto en español, el tipo y la fecha de fin |
| `app_values_changed` | Los valores de la app, en `/admin/configuracion`; sin cuenta | Los nuevos y los de antes |

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
desde los números que tuvo antes, salvo que ese número sea hoy de otra cuenta), sus intentos
fallidos de login y su invitación (con su correo en los eventos de las invitaciones).
Antes muestra en qué base de datos va a trabajar (sin la clave) y qué va a borrar, y pide escribir
el correo de nuevo para confirmar. No uses SQL a mano: podrías dejar mensajes o intentos fallidos
sueltos.

**Limpieza diaria automática** (`src/modules/account/retention.ts`): Vercel Cron llama cada día (4:00
a. m. en Bogotá; `vercel.json → crons`) a `GET /api/cron/limpieza`, que solo responde al secreto
`CRON_SECRET`. Borra lo que `/privacidad` promete borrar a los 30 días:
- los mensajes e intentos fallidos de vinculación de números sin cuenta;
- los movimientos eliminados (dejan de verse al eliminarlos y se borran del todo a los 30 días).

En los logs deja solo las cantidades, y cada corrida queda en `cron_run` (cuándo, si salió bien y qué
borró, o el tipo del error), que se ve en [Salud del sistema](#salud-del-sistema). `CRON_SECRET` es obligatoria (`REQUIRED_ENV`): sin ella, `/api/health`
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
| `undici@>=8.0.0 <8.12.2: 8.12.2` | `jsdom` (pruebas de componentes; también lo trae `vitest`) usa `undici` 8.12.1, con un DoS alto ([GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c)). Solo en desarrollo y en el CI. Forzada en vez de `pnpm update undici`, que re-resolvía otras dependencias (el `@babel/core` que ve Next); la 8.12.3 todavía no cumple los 7 días de `minimum-release-age` | `jsdom` traiga `undici` 8.12.2 o más nueva |
| `fast-uri@>=3.0.0 <3.1.9: 3.1.9` | `ajv` (lo usa Stryker, solo para la mutación) trae `fast-uri` 3.1.8, con 4 avisos (2 moderados y 2 bajos: [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) y otros) sobre cómo normaliza URLs. Solo en desarrollo y en el CI. Editado a mano en el lockfile, como `undici`, para no re-resolver el resto | `ajv` traiga `fast-uri` 3.1.9 o más nueva |

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
- **Versiones forzadas del CLI** (`.github/vercel-cli/package.json → pnpm.overrides`): corrigen 26
  avisos de sus dependencias internas, siempre dentro de la misma versión mayor para no romperlo:
  - `tar` 7.5.22 (incluido un aviso crítico);
  - `minimatch` 10.2.6;
  - `js-yaml` 4.3.2;
  - `smol-toml` 1.9.0;
  - `path-to-regexp` 6.3.0 y 8.4.2;
  - `ajv` 8.18.0, con `fast-uri` 3.1.9;
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
(`vercel.json` → `git.deploymentEnabled: false`); lo hace el job `deploy` del CI
(`.github/workflows/ci.yml`), que solo corre en `main` y solo si lint, tipos y todas las pruebas
pasaron. Sus pasos están en `.github/workflows/deploy.yml`, que usa también el simulacro de abajo.
Ese job ejecuta `pnpm vercel-build` (migraciones + categorías + build), así que tampoco una
migración rota llega a la base de producción.

**Cada versión se prueba antes de recibir tráfico** (smoke tests, `scripts/smoke.mjs`):

1. Se publica **sin dominio** (`vercel deploy --prebuilt --prod --skip-domain --archive=tgz`): queda
   en su propia URL y los usuarios siguen en la versión anterior. El build sube comprimido: archivo
   por archivo, unos pocos despliegues en un día pasan el límite de subidas del plan gratis de
   Vercel (5000 en 24 horas).
2. Smoke tests contra esa URL. Si fallan, el job se detiene: el dominio nunca cambió.
3. Se le pasa el dominio (`vercel promote`, instantáneo, sin recompilar).
4. Smoke tests contra el dominio real. Si fallan, **vuelve sola a la versión anterior**
   (`vercel rollback`), comprueba que el dominio quedó en ella y que pasa los smoke tests, y el job
   queda en rojo. También si el job se cancela a mitad, por ejemplo al llegar al tiempo máximo.

**Simulacro de la vuelta atrás:** *Actions → Simulacro de vuelta atrás → Run workflow* (rama `main`)
prueba en producción ese último paso, con los mismos pasos de un despliegue (`deploy.yml`). Publica
`main`, le pasa el dominio, corre los smoke tests y vuelve a propósito a la versión que estaba;
termina en verde si el dominio quedó en ella y la pasa. Dura unos minutos y nadie nota el cambio,
porque la versión nueva es el mismo código que ya está en producción. Por eso no corre si `main`
tiene cambios de la app sin desplegar: primero hay que desplegarlos. No publica release y queda en
el entorno `simulacro` de GitHub, así que no cuenta como desplegado para el job `changes`. Conviene
correrlo después de cambiar algo del despliegue (el CLI de Vercel, el plan, `deploy.yml`).

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
| `CRON_SECRET` | El mismo valor que en Vercel (Settings → Environment Variables). Lo usa la [vigilancia cada hora](#vigilancia-cada-hora) |

Variables de la app en Vercel (*Settings → Environment Variables*): `DATABASE_URL` y
`DATABASE_URL_UNPOOLED` (las crea Neon), `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY` y las
`WHATSAPP_*` de `.env.example`. `BETTER_AUTH_URL` solo hace falta con dominio propio.

Webhook en Meta: `https://<tu-app>.vercel.app/api/whatsapp/webhook`, el mismo
`WHATSAPP_VERIFY_TOKEN` y suscripción al campo `messages`. La cuenta de WhatsApp Business debe
estar suscrita a la app: `scripts/meta-subscribe.sh <WABA_ID> <APP_ID>`.

### Vigilancia cada hora

Un workflow de GitHub Actions (`.github/workflows/vigilancia.yml`, a los 23 minutos de cada hora) llama a
`/api/cron/vigilancia` con `CRON_SECRET` (`scripts/vigilancia.mjs`). La ruta revisa:
- lo mismo que `/api/health`;
- la conexión con WhatsApp y con Claude, como "Probar conexiones" (sin enviar nada ni gastar créditos);
- las alertas del bot.

Si algo falla, o la app no responde, abre un issue con la etiqueta `vigilancia`: GitHub le avisa al dueño
por correo y en el celular. Cuando todo vuelve a estar en orden, lo cierra con un comentario. Solo actúa
al pasar de bien a mal o al revés, así que un problema que sigue no manda un aviso cada hora.

- **El repositorio es público:** el issue y el log no dicen qué falla, solo dónde mirarlo (Salud del
  sistema y Bot de WhatsApp). La ruta tampoco devuelve detalles, solo de qué tipo es cada problema.
- **Necesita el secreto `CRON_SECRET` en GitHub** (*Settings → Secrets and variables → Actions*), con el
  mismo valor que en Vercel. Si falta o no coincide, el workflow queda en rojo con el motivo, y GitHub
  también avisa.
- **El dominio** es el del último despliegue exitoso al entorno `production` de GitHub, que registra
  `deploy.yml` con su `PRODUCTION_URL`, el único lugar donde está. Es donde corre la app de verdad.
- **Para probarla:** *Actions → Vigilancia → Run workflow*.
- **GitHub apaga los workflows programados** de un repositorio público que pasa 60 días sin actividad.
  Si eso pasa, se vuelve a activar en *Actions → Vigilancia → Enable workflow*.

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
