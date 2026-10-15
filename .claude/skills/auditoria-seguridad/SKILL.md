---
name: auditoria-seguridad
description: Auditoría de seguridad y vulnerabilidades de Finanzas MVP (Next.js + Better Auth + Postgres + bot de WhatsApp con Claude). Úsala cuando se pida auditar la seguridad o la ciberseguridad, buscar vulnerabilidades, revisar un cambio antes de un PR que toque autenticación, roles, administración, el webhook, el bot o las cabeceras, o repasar los pendientes de una auditoría anterior. Modos — completa (por defecto), cambios (la rama actual frente a main, o un PR) o un área (auth, autorizacion, entradas, webhook, bot, datos, cabeceras, secretos, dependencias, ci, produccion).
argument-hint: "[completa | cambios [n.º de PR] | <área>]"
---

# Auditoría de seguridad

Audita la seguridad de este proyecto, verifica cada hallazgo y entrega un informe priorizado.
Responde en español. Modo pedido: `$ARGUMENTS` (vacío = `completa`).

## Reglas de la auditoría (no negociables)

1. **Solo lectura.** Durante la auditoría no cambies código, configuración, la base ni GitHub.
   Los arreglos van después, cada uno en su rama `fix/…` (o `hotfix/…` si es crítico y está en
   producción), con sus pruebas, siguiendo CLAUDE.md, y **solo si la persona lo confirma**.
2. **Pruebas activas solo en local**: el servidor de desarrollo o el build local (`localhost`) y la
   base de pruebas (`TEST_DATABASE_URL`, terminada en `_test`). **Producción, solo en pasivo**:
   `GET`/`HEAD` de páginas públicas, cabeceras y `/api/health`. Nunca fuerza bruta, carga, fuzzing
   ni escaneos activos contra producción; nunca mensajes reales a WhatsApp ni llamadas que gasten
   créditos de Anthropic sin pedir permiso antes.
3. **Nunca muestres un secreto.** Si encuentras uno, informa el archivo, la línea y el tipo, nunca
   el valor. No leas el contenido de `.env` en el chat: como mucho, qué variables existen.
4. **El repositorio es público.** El informe **no se sube al repo**: va a
   `reports/seguridad/AAAA-MM-DD-<modo>.md` (`/reports` está en `.gitignore`). Los títulos y
   descripciones de los PRs de arreglo explican el cambio sin la receta para explotarlo hasta que
   esté desplegado. Para algo crítico, sugiere un *security advisory* privado de GitHub.
5. **Cada hallazgo se verifica** antes de entrar al informe (paso 4). Sin escenario concreto
   (quién, con qué, qué obtiene), no es un hallazgo: a lo sumo, una observación informativa.

## Paso 1. Preparación

- Lee en CLAUDE.md la sección "Seguridad y datos" y, en el README, las de roles, administración,
  despliegue y CI: son los controles que el proyecto promete. Un control prometido que falta es un
  hallazgo.
- Busca el informe anterior: `ls -t reports/seguridad/ 2>/dev/null | head -3`. Si hay, léelo: sus
  pendientes se revisan primero y el informe nuevo dice cuáles se resolvieron.
- Fija el alcance según el modo:
  - `completa`: todas las áreas de [checklist.md](checklist.md).
  - `cambios`: `git diff main...HEAD` (o `gh pr diff <n.º>` si se dio un PR). Revisa lo que cambió
    **y** lo que depende de eso: una función nueva en un archivo `"use server"` es un endpoint
    público, aunque nadie la llame todavía.
  - `<área>`: solo esa sección del checklist.

## Paso 2. Herramientas automáticas

Corre lo que aplique al alcance y resume en el informe solo lo que no esté en verde:

```bash
pnpm audit --prod                      # dependencias de producción (todas las severidades)
pnpm audit --dev --audit-level high    # herramientas del CI y de desarrollo
pnpm vitest run --project unit src/authorization-matrix.test.ts src/lib/security-headers.test.ts src/forms.test.ts
gh api repos/{owner}/{repo} --jq .security_and_analysis
gh api "repos/{owner}/{repo}/dependabot/alerts?state=open" --jq '.[] | "\(.security_advisory.severity) \(.dependency.package.name) \(.security_advisory.summary)"'
gh api "repos/{owner}/{repo}/code-scanning/alerts?state=open" --jq '.[] | "\(.rule.severity) \(.rule.id) \(.most_recent_instance.location.path):\(.most_recent_instance.location.start_line)"'
gh api "repos/{owner}/{repo}/secret-scanning/alerts?state=open" --jq '.[] | "\(.secret_type) \(.created_at)"'
gh run list --workflow ci.yml --branch main --limit 1 --json databaseId,conclusion,headSha
```

- Si una llamada a `gh api` responde 403/404, anótalo como "no se pudo revisar" (falta de permisos
  o función apagada), sin insistir.
- Avisos de las dependencias clave en la versión instalada, aunque `pnpm audit` no los muestre:
  `gh api "/advisories?ecosystem=npm&affects=<paquete>@<versión>"` para `next`, `better-auth`,
  `drizzle-orm`, `postgres` y `@anthropic-ai/sdk` (la versión sale de
  `node -p "require('<paquete>/package.json').version"`).
- Del último ZAP del CI, mira solo si el job pasó. Para ver su reporte hay que descargar el
  artefacto: pide permiso antes.
- Secretos en el repo, **sin imprimir valores** (solo archivo y línea):

  ```bash
  git ls-files | grep -E '(^|/)\.env' | grep -v '\.env\.example$'
  git grep -nIE 'sk-ant-[A-Za-z0-9_-]{10,}|EAA[A-Za-z0-9]{30,}|postgres(ql)?://[^:/ ]+:[^@ ]+@|-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}' -- . ':!pnpm-lock.yaml' \
    | grep -vE '@(localhost|127\.0\.0\.1)[:/]' | cut -d: -f1,2
  git log --all -G 'sk-ant-[A-Za-z0-9_-]{10,}|EAA[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY' --format='%h %ad %s' --date=short | head
  ```

  Las pruebas de `scripts/` usan URLs falsas (`db.neon.tech`, `ep-x.neon.tech`): son esperables.
  Para revisar una coincidencia, muéstrala enmascarada:
  `sed -n '<línea>p' <archivo> | sed -E 's#(postgres(ql)?://)[^@ ]+@#\1***:***@#g; s#(sk-ant-|EAA)[A-Za-z0-9_-]+#\1***#g'`.
  Un secreto real en el historial sigue expuesto aunque se borre del código: hay que **rotarlo**
  (en Vercel y en el proveedor). Reescribir el historial no basta, porque el repo es público.

## Paso 3. Revisión manual

Recorre [checklist.md](checklist.md) en las áreas del alcance. Lee el código, no supongas: cada
punto dice qué archivos mirar. Para cada posible hallazgo anota archivo:línea, qué pasa, el
escenario concreto y una severidad tentativa (escala en [plantilla-informe.md](plantilla-informe.md)).

En modo `completa`, reparte las áreas en **subagentes en paralelo** (tipo `Explore`, solo lectura),
por ejemplo:

- autenticación y autorización;
- entradas, webhook y bot;
- datos, cabeceras y secretos;
- dependencias y CI.

Pásale a cada uno la sección del checklist y las reglas 1–3 de arriba, y pídele una lista de
posibles hallazgos con archivo:línea y escenario, sin arreglos. Tú haces la verificación.

## Paso 4. Verificación

Para cada posible hallazgo:

1. Sigue el camino completo en el código: ¿de verdad llega la entrada del atacante hasta ahí? ¿Hay
   un control antes (proxy, `requireUser`, zod, la firma, un límite) que lo detenga?
2. Si se puede, **reprodúcelo en local**:
   - una prueba unitaria o de integración (contra la base `_test`) que muestre el fallo;
   - o un `curl` contra `localhost`.

   No dejes esas pruebas en el repo durante la auditoría: guárdalas en el scratchpad y súmalas
   después al PR del arreglo.
3. Clasifícalo:
   - **CONFIRMADO**: reproducido o demostrado en el código sin dudas;
   - **PROBABLE**: el camino existe pero no se pudo reproducir;
   - **descartado**: no entra al informe. Anota en una línea por qué, para no volver a revisarlo.
4. Ajusta la severidad con el escenario real, no con el peor caso teórico.

## Paso 5. Informe

- Escribe el informe con [plantilla-informe.md](plantilla-informe.md) en
  `reports/seguridad/AAAA-MM-DD-<modo>.md` (fecha de hoy; crea la carpeta si no existe).
- En el chat, muestra solo esto, sin la receta de explotación de lo que siga abierto:
  - un resumen corto;
  - los hallazgos ordenados por severidad, con archivo:línea y el arreglo propuesto;
  - lo que se resolvió desde la auditoría anterior;
  - la ruta del informe.
- Termina proponiendo el plan de arreglos:
  - una rama por hallazgo, o por grupo pequeño del mismo tema;
  - primero lo crítico y lo alto.

  Pregunta antes de empezar cualquiera. Si un hallazgo pide cambiar una regla de CLAUDE.md o el
  modo de trabajo, proponlo en vez de hacerlo.

## Cuándo usar cada modo

- `cambios`: antes de abrir un PR que toque autenticación, roles, administración, el webhook, el
  bot, las cabeceras, las variables de entorno o los workflows.
- `completa`: una vez al mes, después de una funcionalidad grande o cuando se agregue un servicio
  externo.
- Un área: cuando haya una alerta concreta (Dependabot, CodeQL, un aviso de seguridad de Next o de
  Better Auth).
