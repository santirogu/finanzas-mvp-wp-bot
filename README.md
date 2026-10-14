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
| `pnpm typecheck` · `lint` · `test` | Tipos, ESLint y pruebas unitarias |
| `pnpm db:generate` | Genera una migración SQL tras cambiar `src/db/schema/*` |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm db:seed` | Inserta categorías globales (idempotente) |
| `pnpm db:studio` | Explorador visual de la base de datos |
| `pnpm bot:try "texto"` | Muestra cómo interpreta el bot un mensaje (usa la API de Claude) |
| `pnpm bot:eval` | Corre el set de ~50 frases de prueba del bot y reporta aciertos, latencia y costo |

> No uses `pnpm setup` (es un comando propio de pnpm que modifica tu shell). El script del proyecto se llama `db:setup`.

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

## Despliegue (recomendado)

1. **Base de datos:** crea un proyecto en [Supabase](https://supabase.com) o [Neon](https://neon.tech)
   y copia la URL de conexión *pooled* (Supabase: puerto 6543; Neon: host `-pooler`).
2. **Migraciones:** `DATABASE_URL=<url> pnpm db:setup`.
3. **App:** importa el repo en [Vercel](https://vercel.com) y configura `DATABASE_URL`,
   `BETTER_AUTH_SECRET` (uno nuevo, distinto al local), `BETTER_AUTH_URL` (tu dominio),
   `ANTHROPIC_API_KEY` y las variables `WHATSAPP_*` de `.env.example`.
4. **Webhook en Meta:** URL `https://<tu-dominio>/api/whatsapp/webhook`, el mismo
   `WHATSAPP_VERIFY_TOKEN`, y suscripción al campo `messages`.

## Roadmap

- [x] **Fase 1:** auth por sesión, dashboard con balance del mes, pestañas de ingresos y egresos.
- [x] **Fase 2: bot de WhatsApp.** Webhook (firma, idempotencia), vinculación del número desde el
      dashboard, interpretación con Claude (salida estructurada), comandos `balance` / `deshacer`
      y simulador local.
- [ ] Conectar un número real de WhatsApp y publicar en Vercel.
- [ ] **Fase 3:** rate limiting, Sentry, CI, política de privacidad y salida a producción en Meta.
