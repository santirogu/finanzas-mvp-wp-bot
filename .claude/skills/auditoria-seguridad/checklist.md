# Checklist de seguridad de Finanzas MVP

Cada área dice qué mirar y dónde. Los nombres de área son los que acepta el skill como argumento.
Si un archivo cambió de lugar, búscalo antes de dar el punto por bueno o por malo, y actualiza
este checklist en el PR del arreglo. Lo que cubren las pruebas automáticas se revisa igual: una
prueba que pasa puede estar probando lo que no es.

**Decisiones ya tomadas (riesgos aceptados):** están en la tabla "Riesgos aceptados" del README
(sección Seguridad), con su porqué y cuándo revisarlas. Léela antes de empezar.
- No las reportes como hallazgos nuevos: anótalas como informativas y revisa solo la columna
  "Revisar si…".
- Si la persona acepta un riesgo nuevo, propón agregarlo a esa tabla en el PR del cambio; no lo dejes
  solo en el informe, que no se sube.

## auth — Autenticación y sesiones

Archivos:
- `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/auth-errors.ts`, `src/lib/expired-session.ts`;
- `src/modules/auth/lockout.ts` (bloqueo por cuenta, tabla `login_failure`) y
  `src/modules/auth/two-factor-rules.ts`;
- `src/app/[lang]/(auth)/`, `src/app/api/auth/[...all]/route.ts`.

Puntos a revisar:
- **Límites de intentos:**
  - `rateLimit` guardado en la base, no en memoria (en serverless cada instancia tendría el suyo);
  - reglas por ruta para el inicio de sesión, el registro, los dos pasos y la recuperación de contraseña.
- **Bloqueo por intentos fallidos:**
  - el de la contraseña (`login_failure`) y el del código TOTP (`failedVerificationCount`,
    `lockedUntil`);
  - se cuenta por correo, también para correos que no existen, así que no revela cuáles están
    registrados;
  - no se puede saltar por otra ruta, como los códigos de respaldo, otro endpoint del plugin o el
    cambio de mayúsculas en el correo.
- **Rutas de dos pasos:** `TWO_FACTOR_DISABLED_PATHS` sigue respondiendo 404 y no existe "recordar
  este dispositivo". Con la verificación ya activa, `verify-totp` y `verify-backup-code` responden 403
  si hay sesión (solo sirven para entrar).
- **Rutas de Better Auth abiertas:**
  - `/api/auth/*` solo atiende `AUTH_HTTP_ROUTES` (`src/modules/auth/http-routes.ts`);
  - `src/lib/auth-routes.int.test.ts` clasifica cada endpoint;
  - si alguien agregó una ruta a la lista, revisa que el navegador de verdad la necesite y que no
    esquive el bloqueo ni los dos pasos.
- **Cada contraseña que se verifica reserva su intento antes** (`reserveAttempt` en `lockout.ts`). Pasa
  en el login, al activar los dos pasos y al eliminar la cuenta. Una ruta o acción nueva que verifique
  una contraseña debe hacer lo mismo.
- **Contraseñas:**
  - mínimo y **máximo** de longitud (una contraseña enorme encarece el hash y sirve para un DoS);
  - el hash es el de Better Auth;
  - no se registran en logs.
- **Cookie de sesión:** `httpOnly`, `Secure` en producción y `SameSite`.
- **Duración y cierre de sesiones:**
  - expiración y renovación razonables;
  - suspender, eliminar o "cerrar sesiones" invalida de verdad las sesiones abiertas, también si
    hay caché de la cookie de sesión.
- **Campos protegidos:** los `additionalFields` sensibles (`role`, `suspendedAt`, `suspensionReason`)
  tienen `input: false`. Un usuario no puede fijarlos con `sign-up` ni con `update-user`;
  pruébalo en local con `curl`.
- **Orígenes:** `trustedOrigins` incluye solo los dominios propios. Revisa qué pasa con los
  despliegues de vista previa de Vercel.
- **Enumeración de cuentas:** ¿los mensajes del inicio de sesión, el registro o la recuperación
  revelan si un correo existe? Si se acepta, que sea una decisión consciente.
- **Secreto de Better Auth:** `BETTER_AUTH_SECRET` es obligatorio en producción y está en
  `REQUIRED_ENV` (`src/lib/health.ts`).

## autorizacion — Roles, aislamiento entre cuentas y administración

Archivos:
- `src/lib/session.ts`, `src/lib/roles.ts`, `src/proxy.ts`, `src/authorization-matrix.test.ts`;
- `src/app/[lang]/(app)/admin/`, `src/modules/admin/`;
- los archivos `"use server"`: `src/modules/*/actions.ts` y `src/app/[lang]/(app)/**/actions.ts`.

Puntos a revisar:
- **Matriz de autorización:** toda página, ruta de API y Server Action está clasificada, y la
  clasificación es correcta (léela, no solo la corras).
- **Funciones de los archivos `"use server"`:** cada función exportada es un endpoint público.
  Todas validan la sesión adentro (`requireUser` / `requireAdmin`); que el layout o el proxy lo
  hagan no basta, porque el proxy solo redirige rápido.
- **IDOR:**
  - cada id que llega del cliente se valida (`z.uuid()`);
  - cada consulta o modificación filtra por el `userId` de la sesión.
  - Prueba con dos usuarios en integración: editar o eliminar el movimiento de otro, ver sus
    totales, deshacer sus mensajes de WhatsApp.
- **Administración:**
  - `requireAdmin()` (rol más dos pasos) en páginas, acciones y consultas;
  - `requireAdminRole()` solo en `/admin/seguridad` y en el layout;
  - las acciones que cambian datos usan `confirmAdminCode` (códigos de un solo uso, comparten el
    bloqueo con el inicio de sesión) y quedan auditadas en la misma transacción.
- **El admin sobre sí mismo:** ¿se puede suspender, eliminar o desvincular su propia cuenta? ¿Y
  quitarse el rol? El rol solo cambia con `pnpm admin:grant` / `admin:revoke`.
- **Cuentas suspendidas:** `isSuspended` se respeta en todos los caminos de entrada: inicio de
  sesión, `getCurrentUser`, el bot, el simulador y cualquier ruta nueva.
- **Datos ajenos en respuestas:** los listados de administración no exponen más de lo que dice
  `/privacidad`; por ejemplo, nunca montos ni descripciones de movimientos.

## entradas — Validación de entradas y salidas

Archivos: Server Actions, `src/modules/*/validation.ts`, `src/modules/admin/shared/{filters,sql}.ts`,
componentes que muestran texto del usuario.

Puntos a revisar:
- **Validación con zod en el servidor:** todo lo que llega de `FormData`, `params` y `searchParams`
  se valida ahí, con longitudes máximas. La validación del navegador no cuenta.
- **SQL:**
  - Drizzle parametriza, pero busca `sql.raw(`, `sql` con texto armado a mano, `ORDER BY` o columnas
    dinámicas, y `LIKE`/`ILIKE` sin escapar `%`, `_` y `\`;
  - `git grep -n "sql.raw\|sql\`" src`.
- **XSS:**
  - `dangerouslySetInnerHTML`;
  - `href`/`src` con valores del usuario (`javascript:`);
  - texto del usuario dentro de correos o de mensajes de WhatsApp.
- **Redirecciones abiertas:** `redirect()`, `router.push` o `callbackURL` de Better Auth con valores
  que vienen del usuario.
- **ReDoS:** expresiones regulares con cuantificadores anidados sobre texto del usuario. CodeQL cubre
  parte, no todo.
- **Errores:** las respuestas de error no devuelven trazas, SQL ni detalles internos.

## webhook — Webhook de WhatsApp y vinculación

Archivos:
- `src/app/api/whatsapp/webhook/route.ts`;
- `src/modules/whatsapp/{signature,payload,phone,client,link,actions}.ts`;
- `src/lib/service-url.ts`.

Puntos a revisar:
- **Firma `X-Hub-Signature-256`:**
  - HMAC-SHA256 del **cuerpo crudo** con el app secret, con comparación en tiempo constante;
  - se rechaza antes de parsear el JSON o tocar la base;
  - una firma ausente, mal formada o de otro largo no lanza una excepción no controlada.
- **Verificación `GET`:** compara `hub.verify_token` de forma segura y no refleja valores sin validar.
- **Repeticiones e idempotencia:** `external_id` evita registrar dos veces un mensaje. ¿Qué pasa con
  un mensaje viejo reenviado con una firma válida?
- **Payload hostil:** tipos inesperados, campos faltantes, arreglos enormes, textos muy largos,
  números con formato raro, muchos mensajes en una sola entrega. Revisa el tamaño máximo que se
  procesa.
- **Vinculación por código:**
  - entropía y expiración del código;
  - límite de intentos por número, contado en `account_event` dentro de la misma transacción que
    revisa el código, con un bloqueo por número (`link.ts`), y límite de códigos por cuenta;
  - un código nuevo invalida el anterior;
  - no se puede vincular un número a la cuenta de otro.
- **Token de WhatsApp:**
  - solo en el servidor y nunca en logs;
  - `WHATSAPP_API_URL` y `ANTHROPIC_BASE_URL` solo aceptan `localhost`; si no, el token viajaría a
    otro host.

## bot — Bot e IA (Claude)

Archivos:
- `src/modules/bot/` (en especial `prompt.ts`, `claude-extractor.ts`, `normalize.ts`,
  `handle-message.ts` y `commands.ts`);
- `src/app/[lang]/(app)/simulador/`.

Puntos a revisar:
- **Inyección de instrucciones (prompt injection):**
  - el mensaje va delimitado (`<mensaje>`) y la salida pasa por `normalize` (montos, fechas,
    categorías) antes de tocar la base;
  - el modelo no tiene herramientas ni ve datos de otros;
  - prueba en local, con el extractor falso o en una corrida de `bot:eval` aprobada, mensajes que
    pidan ignorar las reglas, registrar en otra cuenta o revelar el prompt. Revelar el prompt es de
    impacto bajo: no tiene secretos.
- **Costo y abuso:**
  - el cupo por cuenta (`AI_LIMITS` en `src/modules/bot/limits.ts`, reservado en `ai-quota.ts` antes
    de cada llamada);
  - el tope de movimientos por mensaje;
  - `max_tokens`, `timeout` y reintentos acotados;
  - que todo camino nuevo hacia Claude pase por el cupo.
- **La respuesta libre del modelo** pasa por `normalizeReply` (una línea, largo máximo, sin enlaces).
- **Qué se guarda de cada mensaje:**
  - en `whatsapp_message` y en los logs, cuánto tiempo y quién lo ve;
  - que coincida con `/privacidad`.
- **Simulador:** solo registra en la cuenta de la sesión y respeta la suspensión.

## datos — Datos personales y privacidad

Archivos:
- `src/modules/account/` (`delete-account.ts`, `suspension.ts`, `events.ts`);
- `scripts/delete-data.ts`, `src/db/schema/`;
- `src/app/[lang]/privacidad/`.

Puntos a revisar:
- **Borrado completo de una cuenta:** `deleteAccountData` borra todo lo de la persona. Revisa cada
  tabla con datos personales: si no tiene clave foránea en cascada hacia `user`, debe borrarse a mano.
- **Retención:** lo que `/privacidad` promete borrar con el tiempo está en `runDailyCleanup`
  (`src/modules/account/retention.ts`), que llama Vercel Cron (`vercel.json`) con `CRON_SECRET`.
  - Si se agregó un dato con plazo, revisa que esté ahí.
  - Revisa que el cron siga en `vercel.json`.
- **Logs** (`console.log`, `console.error`, `console.warn`): no imprimen contraseñas, códigos TOTP,
  tokens, cuerpos completos de mensajes ni más datos personales de los necesarios.
  - Los errores van por `describeError` (`src/lib/safe-log.ts`); la guardiana es `src/logs.test.ts`.
  - Revisa también lo que se guarda en columnas de error, como `whatsapp_message.error`.
  - `git grep -n "console\." src`.
- **La política coincide con el código:** lo que dice `/privacidad` es lo que hace el código, en lo
  que se guarda, quién lo ve, cuánto dura y con quién se comparte. Una diferencia es un hallazgo.
- **IP:** las IPv6 se guardan truncadas al /64, como promete la política.

## cabeceras — Cabeceras, CSP, cookies y CSRF

Archivos: `src/lib/security-headers.ts`, `next.config.ts`, `src/proxy.ts`, `src/app/robots.ts`.

Puntos a revisar:
- **CSP en producción:**
  - sin `unsafe-eval`; `unsafe-inline` en `script-src` es un riesgo aceptado (ver arriba);
  - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `form-action`;
  - solo los dominios que de verdad se usan.
- **Otras cabeceras:** HSTS (con `includeSubDomains`; `preload` solo si se decide), `X-Content-Type-
  Options`, `Referrer-Policy` y `Permissions-Policy`.
- **Comprobación pasiva en producción:** compara lo esperado con lo real.

  ```bash
  curl -sI https://anotadoapp.vercel.app/login
  curl -sI https://anotadoapp.vercel.app/api/health
  ```

- **CSRF:**
  - las Server Actions comparan `Origin` con `Host`; revisa si hay `serverActions.allowedOrigins`
    en `next.config.ts`;
  - Better Auth valida el origen;
  - ningún `GET` tiene efectos (ni el webhook ni el health).
- **Indexación:** `robots.ts` no deja indexar las páginas privadas, y las páginas con datos no se
  cachean en la CDN (`Cache-Control`).
- **Huellas del servidor:** `poweredByHeader: false`, y nada de *source maps* públicos
  (`productionBrowserSourceMaps`).

## secretos — Secretos y configuración

Archivos: `.env.example`, `src/lib/env.ts`, `src/lib/health.ts`, `vercel.json`, `.gitignore`.

Puntos a revisar:
- **Secretos en el código y el historial:** los comandos del paso 2 del skill, sin mostrar valores.
- **`.env` fuera del repo:** solo `.env.example` está versionado, y sin valores reales.
- **Variables públicas:** las `NEXT_PUBLIC_*` no tienen nada sensible. `git grep -n NEXT_PUBLIC_`.
- **`/api/health`:** no revela qué variables faltan ni versiones a quien no tiene sesión.
- **Escaneo de secretos de GitHub:** el escaneo y la *push protection* están activos
  (`security_and_analysis`).
- **Despliegues:** `vercel.json` mantiene `"deploymentEnabled": false`, porque los despliegues solo
  salen del job `deploy`.

## dependencias — Dependencias y cadena de suministro

Archivos: `package.json`, `pnpm-lock.yaml`, `.github/dependabot.yml`.

Puntos a revisar:
- **Vulnerabilidades conocidas:** `pnpm audit` (producción y desarrollo), las alertas abiertas de
  Dependabot y los avisos de seguridad de `next`, `better-auth`, `drizzle-orm`, `postgres` y
  `@anthropic-ai/sdk` en la versión instalada.
- **Scripts de instalación:**
  - en la app no se autoriza ninguno (`pnpm.ignoredBuiltDependencies`), y en
    `.github/vercel-cli/package.json` solo `esbuild`;
  - `.npmrc` mantiene `strict-dep-builds=true` y `minimum-release-age`;
  - toda dependencia nueva en esas listas lleva su porqué en el README.
- **El CLI de Vercel** se instala desde `.github/vercel-cli/` con su lockfile, nunca con `pnpm dlx`.
- **Paquetes de riesgo:** sin mantenimiento, con un solo mantenedor o con nombres parecidos a otros
  conocidos (*typosquatting*) entre los agregados desde la auditoría anterior. Para verlos:
  `git log -p --since=<fecha> -- package.json`.

## ci — CI/CD y GitHub

Archivos: `.github/workflows/*.yml`, `scripts/{deploy-needed,smoke,release}.mjs`, `.githooks/`.

Puntos a revisar:
- **Permisos de los workflows:** `permissions` mínimos por workflow y por job (`contents: read` por
  defecto).
- **Acciones de terceros:** fijadas por SHA (con la versión en un comentario), no por etiqueta; las
  imágenes de Docker, por digest. Todos los `actions/checkout` llevan `persist-credentials: false`.
- **Secretos por paso:** en el job de despliegue, `VERCEL_TOKEN` va solo en los pasos que hablan con
  la API de Vercel (`pull`, `deploy`, `inspect`, `promote`, `rollback`). Nunca va en el `env` del job,
  en la instalación de dependencias ni en `vercel build`, que corre todo el código del build y no lo
  necesita.
- **Inyección en `run:`:** ningún `${{ github.event.* }}` va directo dentro de `run:` (títulos o
  cuerpos de PR, nombres de rama). Debe pasar por `env:`.
- **Código no confiable con secretos:** nada de `pull_request_target` ni `workflow_run` que haga
  checkout del código de un PR, y ningún secreto expuesto a PRs de forks.
- **El job de despliegue:** solo corre en `main` después de las pruebas, con migraciones, smoke
  tests y vuelta atrás automática.
- **La regla "Proteger main":** sigue activa (`gh api repos/{owner}/{repo}/rulesets`) y no hay
  auto-merge activado.

## produccion — Comprobación pasiva de producción

Solo `GET` y `HEAD`, pocos pedidos y espaciados. Nada que cree datos, intente iniciar sesión o
mande mensajes.

Puntos a revisar:
- **HTTPS:** `http://` redirige a `https://`.
- **Cabeceras de seguridad y CSP:** las mismas que en local.
- **Páginas privadas sin sesión:** `/dashboard`, `/admin`, `/admin/usuarios` y `/egresos` redirigen
  al login, sin mostrar datos.
- **Páginas de error y 404:** sin trazas ni rutas internas.
- **`/api/health`:** responde solo `{"status":"ok"}`.
- **`robots.txt`:** coherente con `robots.ts`.
