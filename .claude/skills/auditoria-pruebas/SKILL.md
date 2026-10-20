---
name: auditoria-pruebas
description: Auditoría de las pruebas y de la calidad de la cobertura de Finanzas MVP (Vitest unitarias, de componentes y de integración, Playwright E2E, Stryker, el CI). Úsala cuando se pida auditar las pruebas, la cobertura o la calidad del código probado, revisar si un cambio quedó bien probado antes de un PR que agregue lógica, buscar pruebas frágiles o intermitentes, o repasar los pendientes de una auditoría de pruebas anterior. Modos — completa (por defecto), cambios (la rama actual frente a main, o un PR) o un área (cobertura, unitarias, integracion, componentes, e2e, mutacion, ci).
argument-hint: "[completa | cambios [n.º de PR] | <área>]"
---

# Auditoría de pruebas

Revisa si las pruebas de este proyecto detectarían de verdad un error, no solo cuánto código
recorren. Verifica cada hallazgo y entrega un informe priorizado. Responde en español. Modo pedido:
`$ARGUMENTS` (vacío = `completa`).

Una cobertura del 97 % no dice si una prueba fallaría ante un error: una prueba que recorre el
código sin revisar lo que devuelve también suma. Por eso esta auditoría combina:
- **Lo medible:** el inventario automático (`inventario.mjs`), la cobertura por archivo, el último
  reporte de Stryker y el historial del CI.
- **Lo que pide criterio:** si lo importante (dinero, autorización, el bot, borrar datos) tiene
  pruebas del nivel correcto, con los casos borde, y si cada aserción revisa lo que importa.

## Reglas de la auditoría (no negociables)

1. **Solo lectura.** Durante la auditoría no cambies código, pruebas ni configuración. Los arreglos
   van después, cada uno en su rama `test/…` (o `fix/…` si una prueba nueva destapa un error de la
   app), siguiendo CLAUDE.md, y **solo si la persona lo confirma**.
2. **Para demostrar un hallazgo, nunca toques la copia de trabajo.** Para meter un error a propósito
   y ver qué pruebas fallan, usa un worktree aparte (paso 5) o Stryker (que trabaja en su propia
   copia). La copia de trabajo de la persona puede tener cambios sin commit.
3. **Las pruebas corren solo en local y contra las bases `_test`** (`TEST_DATABASE_URL`,
   `finanzas_e2e_test`). Nunca contra producción, nunca con mensajes reales de WhatsApp ni llamadas
   que gasten créditos de Anthropic (`pnpm bot:eval` cuesta: pide permiso).
4. **No corras dos suites pesadas a la vez.** Stryker usa todos los núcleos: corrido junto a
   `pnpm test:coverage` o a las E2E, hace fallar pruebas por tiempo y parecen errores. Las E2E y la
   auditoría de diseño usan la misma base y el mismo puerto (3100).
5. **El informe no se sube**: va a `reports/pruebas/AAAA-MM-DD-<modo>.md` (`/reports` está en
   `.gitignore`). Los hallazgos de pruebas no son sensibles: los PRs de arreglo los describen sin
   problema.
6. **Cada hallazgo se verifica** (paso 5). Sin evidencia (un error que ninguna prueba detecta, un
   archivo que nada mide, una prueba que falla sola) no es un hallazgo: a lo sumo, una observación.

## Paso 1. Preparación

- Lee en CLAUDE.md el punto 4 del flujo de trabajo (qué se corre antes de un PR) y las reglas que
  piden pruebas: **Formularios**, **Celular y tableta**, **E2E que cambian algo de toda la app**,
  **Roles**, borrar una cuenta y "toda consulta o Server Action… con dos usuarios". Una regla
  prometida sin la prueba que la sostiene es un hallazgo.
- Lee en el README la sección **Pruebas y CI** (qué cubre cada nivel y cómo corre el CI).
- Busca el informe anterior: `ls -t reports/pruebas/ 2>/dev/null | head -3`. Si hay, léelo: sus
  pendientes se revisan primero y el informe nuevo dice cuáles se resolvieron.
- Fija el alcance según el modo:
  - `completa`: todas las áreas de [checklist.md](checklist.md).
  - `cambios`: `git diff main...HEAD --stat` (o `gh pr diff <n.º>`). Revisa lo que cambió y si sus
    pruebas cambiaron con él: código nuevo sin prueba nueva, una regla nueva sin el caso que la
    rompe, un arreglo sin la prueba que habría fallado antes.
  - Un área (`cobertura`, `unitarias`, `integracion`, `componentes`, `e2e`, `mutacion`, `ci`): solo
    esa sección del checklist.

## Paso 2. Inventario y herramientas automáticas

1. **Cobertura por archivo:** `pnpm test:coverage` (unos 3 minutos; necesita Docker con la base de
   pruebas). Deja `coverage/coverage-summary.json`, que el inventario usa.
2. **Inventario:** `node .claude/skills/auditoria-pruebas/inventario.mjs` (o `… inventario.mjs
   cambios`). Lista, sin juzgar:
   - el código que la cobertura no mide (fuera de `coverage.include` de `vitest.config.mts`);
   - el código medido que ninguna prueba importa y los archivos bajo el umbral;
   - la lógica que Stryker no muta y el último reporte de Stryker con sus sobrevivientes;
   - las marcas en las pruebas: `.only`, `.skip`, `it.fails`, esperas fijas, aserciones débiles;
   - las páginas sin revisión táctil o de diseño, las tablas fuera de la prueba del borrado de la
     cuenta y las Server Actions o rutas sin prueba de integración.
3. **Mutación** (Stryker tarda y ocupa el Mac: **no lo corras sin que la persona lo pida**):
   - el puntaje y los sobrevivientes de la corrida completa del lunes salen de los **logs** de su run
     (*Actions → Mutation testing*, el último de `main`): `gh run view <id> --log | grep -A3 "\[Survived\]"`.
     Leer los logs no es una descarga; bajar los artefactos sí (pide permiso, con nombre y tamaño);
   - si la persona lo pide, en `cambios`, `pnpm test:mutation:cambios` (solo los archivos de la lista
     que cambiaron). Nunca `pnpm test:mutation` entero en local (unas 8 horas).
4. **El CI** (en `completa` y en el área `ci`):

   ```bash
   gh run list --workflow ci.yml --branch main --limit 30 --json databaseId,conclusion,createdAt,headSha
   gh run view <id> --log 2>/dev/null | grep -E "flaky|Retry #|✘" | head
   ```

   Busca pruebas "flaky" (pasaron al reintento) y jobs que fallaron y pasaron al relanzarlos sin
   cambios: son pruebas intermitentes aunque el CI quede verde. Mira también cuánto tardan los jobs
   de pruebas (`gh run view <id> --json jobs`).
5. **Lo lento:** `pnpm exec vitest run --reporter=verbose 2>&1 | sort -t'(' -k2 -n | tail` muestra las
   pruebas más lentas (más de 1 s en una unitaria suele ser una espera de más).

Resume en el informe solo lo que no esté bien.

## Paso 3. Revisión manual

Recorre [checklist.md](checklist.md) en las áreas del alcance. Lee las pruebas, no solo sus
nombres: el nombre dice qué promete, el cuerpo dice qué revisa. Para cada posible hallazgo anota
archivo:línea, qué pasa, qué error no se detectaría y una severidad tentativa (escala en
[plantilla-informe.md](plantilla-informe.md)).

En modo `completa`, reparte las áreas en **subagentes en paralelo** (tipo `Explore`, solo lectura),
por ejemplo:

- unitarias y mutación (`src/lib`, `src/modules`, `scripts`);
- integración, autorización y datos (`*.int.test.ts`, la matriz, el borrado de la cuenta);
- componentes (`*.test.tsx`);
- E2E y CI (`e2e/`, `playwright.config.ts`, `.github/workflows/`).

Pásale a cada uno su sección del checklist, la salida del inventario que le toca y las reglas 1, 2 y
6 de arriba, y pídele posibles hallazgos con archivo:línea y el error que no se detectaría, sin
arreglos. Tú haces la verificación.

## Paso 4. Por riesgo

Lo que más importa probar en esta app, de mayor a menor (el checklist dice dónde está cada cosa):

1. **El dinero:** montos con centavos, sumas y restas (`sumAmounts`, `roundToCents`), el formato
   (`formatMoney`, `parseAmountInput`), los totales del Resumen y de Reportes.
2. **El acceso a los datos:** que nadie vea ni cambie lo de otra cuenta (dos usuarios en
   integración), los roles y los dos pasos del admin, la suspensión.
3. **El bot:** la firma del webhook, los duplicados de Meta, lo que interpreta Claude (con el
   servidor falso) y los topes.
4. **Borrar datos:** el borrado de la cuenta y la limpieza diaria (`runDailyCleanup`).
5. **Las fechas:** la zona horaria de la persona, el cambio de mes y de año, los bisiestos.

Para cada uno, pregunta: si mañana alguien rompe esto, ¿qué prueba fallaría? Si la respuesta es
"ninguna" o "solo una E2E que tarda minutos y no dice qué se rompió", es un hallazgo.

## Paso 5. Verificación

Para cada posible hallazgo:

1. **Demuéstralo.** Según el tipo:
   - **"Nada detectaría este error":** mete el error en un worktree aparte (nunca en la copia de
     trabajo), corre ahí las pruebas que lo cubren y borra el worktree al terminar:

     ```bash
     git worktree add <scratchpad>/wt HEAD
     ln -s "$PWD/node_modules" <scratchpad>/wt/node_modules
     ln -s "$PWD/.env" <scratchpad>/wt/.env   # solo para las de integración
     # editar el archivo en <scratchpad>/wt, y ahí:
     (cd <scratchpad>/wt && pnpm exec vitest run --project unit <prueba>)
     git worktree remove --force <scratchpad>/wt
     # Con git anterior a 2.17 (no tiene "worktree remove"):
     rm -rf <scratchpad>/wt && git worktree prune
     ```

     El worktree tiene lo que está en commits: en modo `cambios`, si hay cambios sin commit, copia
     esos archivos al worktree antes de meter el error.

     Si la persona pidió mutación, Stryker sobre unas líneas también sirve (no toca la copia de trabajo;
     sobrescribe `reports/mutation/`): `npx stryker run --mutate "src/modules/reports/daily.ts:40-50"`.
     Ojo al leer sus mutantes: los muestra sin paréntesis. `(a && b) && c` con el primer `&&` cambiado
     se lee `a || b && c`, pero es `(a || b) && c`. Antes de clasificar uno, míralo en el código.
   - **"Esta prueba no revisa lo que dice":** el mismo método. Si con el error la prueba sigue
     pasando, está demostrado.
   - **"Fuera de la medición" o "sin prueba":** la salida del inventario y la cobertura del archivo
     bastan.
   - **"Intermitente":** el run del CI donde falló y pasó al reintento, o corriéndola varias veces
     en local (`--repeat-each=5` en Playwright, un bucle en Vitest).
2. **Clasifícalo:**
   - **CONFIRMADO**: demostrado (un error que nadie detecta, un archivo que nada mide, una
     intermitencia vista);
   - **PROBABLE**: el camino existe pero no se pudo demostrar (por ejemplo, una carrera que no se
     reprodujo);
   - **descartado**: no entra al informe. Anota en una línea por qué, para no volver a revisarlo
     (un archivo sin lógica, un mutante equivalente, una espera necesaria y explicada).
3. **Ajusta la severidad** con el riesgo real (paso 4), no con el porcentaje.

## Paso 6. Informe

- Escribe el informe con [plantilla-informe.md](plantilla-informe.md) en
  `reports/pruebas/AAAA-MM-DD-<modo>.md` (fecha de hoy; crea la carpeta si no existe).
- En el chat, muestra:
  - un resumen corto y lo que está bien;
  - los hallazgos por severidad, con archivo:línea, el error que no se detectaría y el arreglo
    propuesto;
  - lo que se resolvió desde la auditoría anterior;
  - la ruta del informe.
- Termina proponiendo el plan de arreglos:
  - una rama `test/…` por hallazgo o por grupo pequeño del mismo tema;
  - primero lo crítico y lo alto;
  - para cada uno, la prueba que se agrega y cómo se sabe que sirve (falla con el error, pasa sin él).

  Pregunta antes de empezar cualquiera. Si un hallazgo pide cambiar una regla de CLAUDE.md, el
  umbral de cobertura o la lista de Stryker, proponlo en vez de hacerlo.

## Cuándo usar cada modo

- `cambios`: antes de abrir un PR que agregue o cambie lógica (módulos, Server Actions, rutas,
  componentes de cliente).
- `completa`: una vez al mes, después de una funcionalidad grande o cuando el CI empiece a fallar
  de forma intermitente.
- Un área: cuando haya una duda concreta ("¿las E2E del bot son frágiles?", "¿qué no muta Stryker?").

## Mantenimiento

- Si cambia una convención (dónde van las pruebas, cómo se llaman, la lista de cobertura o la de
  Stryker), actualiza `inventario.mjs` y el checklist en el mismo PR.
- Una revisión que se repite en cada auditoría y no pide criterio va al inventario; una que se
  vuelve una regla del proyecto va a una prueba del repo (como `src/forms.test.ts` o la matriz de
  autorización), para que el CI la exija siempre.
