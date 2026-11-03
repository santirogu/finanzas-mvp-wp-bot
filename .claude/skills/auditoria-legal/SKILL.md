---
name: auditoria-legal
description: Auditoría de protección de datos personales de Anotado según la ley colombiana (Ley 1581 de 2012, Decreto 1377 de 2013 y la SIC) — la autorización, la política de tratamiento, los datos sensibles y de menores, los derechos y sus plazos, los proveedores fuera de Colombia y la retención. Úsala cuando se pida una revisión legal o de privacidad, antes de un PR que agregue datos de las personas, un servicio externo, cambie la retención, la autorización o las páginas legales, o para preparar la lista de lo que debe revisar un abogado. No es asesoría legal. Modos — completa (por defecto), cambios (la rama actual frente a main, o un PR) o un área (autorizacion, politica, sensibles, menores, derechos, terceros, retencion, incidentes, otras-normas).
argument-hint: "[completa | cambios [n.º de PR] | <área>]"
---

# Auditoría legal (protección de datos)

Compara lo que la app hace con los datos de las personas con lo que la ley colombiana exige **por escrito**,
verifica cada hallazgo con su norma y su evidencia, y entrega un informe priorizado. Responde en español. Modo
pedido: `$ARGUMENTS` (vacío = `completa`).

**No es asesoría legal.** Sirve para que la app no se aparte de lo que la norma dice textualmente y de lo que
promete su propia política (lo que más se rompe con el tiempo: un dato nuevo, un proveedor nuevo, un plazo que
cambió). Lo que pide interpretar la norma o decidir un riesgo va a "Para revisar con un abogado", nunca como
conclusión.

## Reglas de la auditoría (no negociables)

1. **Solo lectura.** Durante la auditoría no cambies código, textos ni configuración. Los arreglos van después,
   en ramas `fix/…` (o `feature/…` si piden una funcionalidad, como pedir la edad), siguiendo CLAUDE.md, y **solo
   si la persona lo confirma**.
2. **Cada norma, de su fuente.** Antes de citar un artículo, léelo en una fuente oficial: el Gestor Normativo de
   Función Pública, la Secretaría del Senado, SUIN-Juriscol, el compilador de la Alcaldía de Bogotá (sisjur) o la
   SIC. Nunca de memoria ni de un blog: un blog sirve para encontrar la norma, no para citarla. Anota en el
   informe la dirección y la fecha de consulta. Si no la pudiste leer, el hallazgo queda como PROBABLE.
3. **Sin datos de las personas.** No consultes la base de producción ni copies datos de nadie al informe: la
   evidencia sale del esquema, del código y de las páginas (en local o las públicas de producción, solo `GET`).
4. **No es asesoría legal**, y el informe lo dice arriba. Una interpretación ("¿basta este aviso?", "¿Estados
   Unidos tiene nivel adecuado hoy?") va a "Para revisar con un abogado", con la pregunta concreta.
5. **El informe no se sube**: va a `reports/legal/AAAA-MM-DD-<modo>.md` (`/reports` está en `.gitignore`).
6. **Cada hallazgo se verifica** (paso 4): la norma que lo exige, leída en su fuente, y la evidencia en la app
   (archivo:línea o la página). Sin las dos, no es un hallazgo: a lo sumo, una pregunta para el abogado.

## Paso 1. Preparación

- Lee en CLAUDE.md "Seguridad y datos": **Autorización de los datos**, **Retención**, **Logs sin datos
  personales** y el borrado de una cuenta. En el README, "Decisiones importantes" (la autorización) y "Borrar
  datos a pedido". Son los controles que el proyecto ya promete.
- Lee completas las páginas legales: `/privacidad` (`src/app/[lang]/privacidad/page.tsx` y `legal.tsx`),
  `/eliminar-datos` y `/autorizacion`, y el responsable (`DATA_CONTROLLER`, `src/lib/contact.ts`).
- Busca el informe anterior: `ls -t reports/legal/ 2>/dev/null | head -3`. Si hay, léelo: sus pendientes y sus
  preguntas para el abogado se revisan primero, y el informe nuevo dice cuáles se resolvieron.
- Fija el alcance:
  - `completa`: todas las secciones de [checklist.md](checklist.md).
  - `cambios`: `git diff main...HEAD` (o `gh pr diff <n.º>`). Lo que cambió y lo que depende de eso: una tabla o
    columna con datos de alguien, un servicio externo, un plazo de borrado, la autorización, un texto legal, el
    bot (lo que recibe y a quién se lo manda).
  - Un área: solo esa sección del checklist.

## Paso 2. Inventario automático

```bash
node .claude/skills/auditoria-legal/inventario.mjs           # completa
node .claude/skills/auditoria-legal/inventario.mjs cambios   # frente a origin/main
```

Tarda un segundo y solo lee archivos (y git). Lista:
- las tablas sin clasificar y las que guardan datos de alguien que `/privacidad` no nombra;
- las columnas de la cuenta (`user`);
- los servicios externos del código y las dependencias que hablan con uno, y si la política los nombra;
- lo que borra la limpieza diaria frente a lo que promete la política;
- el contenido mínimo de la política (Decreto 1377, art. 13) que no aparece;
- `PRIVACY_VERSION` y lo que cambió desde que se subió (si cambió qué se guarda o con quién, hay que subirla).

Una línea no es todavía un hallazgo: puede ser que la política lo diga con otras palabras (entonces se ajusta
el inventario) o que el dato no sea de una persona.

## Paso 3. Revisión con criterio

Recorre [checklist.md](checklist.md) en las áreas del alcance. Lee el código, no supongas: cada punto dice qué
norma lo pide y dónde mirar en la app. Para cada posible hallazgo anota:
- la norma (ley o decreto, artículo y literal o numeral);
- qué exige, en una frase;
- qué hace la app, con archivo:línea o la página;
- una severidad tentativa (escala en [plantilla-informe.md](plantilla-informe.md)).

En modo `completa`, reparte el checklist en **subagentes en paralelo** (tipo `Explore`, solo lectura), por
ejemplo: la autorización y la política; los datos sensibles, de menores y el bot; los derechos, la retención y
el borrado; los proveedores y los incidentes. Pásale a cada uno su sección del checklist, la salida del
inventario que le toca y las reglas 1, 3 y 6. Pídele posibles hallazgos con archivo:línea y la norma, sin
arreglos. Tú verificas las normas en su fuente (regla 2) y haces el paso 4.

## Paso 4. Verificación

Para cada posible hallazgo:

1. **La norma:** léela en su fuente oficial (regla 2) y confirma que dice lo que el hallazgo afirma. Muchas
   "obligaciones" que circulan no lo son, o aplican solo a empresas (el Registro Nacional de Bases de Datos, por
   ejemplo).
2. **La evidencia:** míralo en la app. Un texto, en la página como la ve la persona (en local, o la pública de
   producción); un flujo, en el código y, si hace falta, con una prueba corta en local (las E2E y sus ayudas
   sirven para crear una cuenta de prueba). Nunca con datos reales.
3. **Clasifícalo:**
   - **INCUMPLE**: la norma lo exige textualmente y la app no lo hace, o la app hace algo distinto de lo que dice
     su política;
   - **RIESGO**: depende de cómo se interprete la norma o de un hecho que no se puede verificar desde el código
     (un contrato con un proveedor, el criterio vigente de la SIC): va también a "Para revisar con un abogado";
   - **descartado**: no entra al informe. Anota en una línea por qué, para no volver a revisarlo.
4. **Ajusta la severidad** a quién afecta y cuánto: un dato sensible o de un menor pesa más que una fecha que
   falta en la política.

## Paso 5. Informe

- Escribe `reports/legal/AAAA-MM-DD-<modo>.md` con [plantilla-informe.md](plantilla-informe.md).
- En el chat, muestra:
  - un resumen corto y lo que está bien;
  - los hallazgos por severidad, con la norma, dónde y el arreglo propuesto;
  - las preguntas para el abogado, aparte;
  - lo que se resolvió desde la auditoría anterior;
  - la ruta del informe.
- Termina proponiendo el plan de arreglos:
  - una rama por tema (la política, la autorización, la edad, la retención…);
  - primero lo crítico y lo alto;
  - para cada arreglo, si cambia lo que se hace con los datos, sube `PRIVACY_VERSION` en el mismo PR (todas las
    cuentas la vuelven a autorizar) y corre `/auditoria-textos cambios` sobre los textos legales;
  - un cambio de contenido de la política (qué se guarda, cuánto tiempo, con quién) lo decide el dueño.

  Pregunta antes de empezar cualquiera.

## Cuándo usar cada modo

- `cambios`: antes de abrir un PR que agregue o cambie datos de las personas (una tabla, una columna, un campo
  de un formulario, lo que recibe el bot), un servicio externo, la retención, la autorización o las páginas
  legales.
- `completa`: una vez al mes, junto a las otras auditorías, y antes de abrir la app al público o de cambiar quién
  es el responsable (por ejemplo, si se constituye una empresa).
- Un área: cuando haya una duda concreta ("¿podemos recibir notas de voz?", "¿qué hacemos si alguien pide sus
  datos?").

## Mantenimiento

- Si la app agrega una tabla, un servicio externo o un plazo de borrado, clasifícalo en `inventario.mjs`
  (`TABLES`, `SERVICES`, `SDKS`) en el mismo PR: el inventario lo marca hasta que lo hagas.
- Si cambia una norma, una guía de la SIC o el criterio sobre un país, actualiza el checklist con la fuente y la
  fecha de consulta.
- Una revisión que se repite en cada auditoría y no pide criterio va al inventario; una que se vuelve regla del
  proyecto va a una prueba del repo (como `src/lib/contact.test.ts`, que exige los datos del responsable).
