# Plantilla del informe de la auditoría de pruebas

El informe va en `reports/pruebas/AAAA-MM-DD-<modo>.md`. No se sube al repo. Escríbelo en español
claro: lo lee el dueño del proyecto, no un especialista en pruebas.

## Escala de severidad

| Severidad | Cuándo | Qué hacer |
|---|---|---|
| **Crítica** | Un error en algo de alto riesgo (el dinero, el acceso a los datos de otra cuenta, la firma del webhook, borrar datos) llegaría a producción sin que ninguna prueba falle, demostrado metiendo el error. | Arreglo inmediato en `test/…` (o `fix/…` si la prueba nueva destapa un error real). |
| **Alta** | Código con lógica que nada mide o nada prueba. Una prueba que pasa aunque el comportamiento esté roto. Una prueba intermitente en un check obligatorio. Una regla de CLAUDE.md sin la prueba que la sostiene. | En los próximos días, en `test/…`. |
| **Media** | Casos borde que faltan (centavos, fin de mes, empates), aserciones débiles, sobrevivientes de Stryker en lógica que importa, esperas fijas, una prueba que depende de otra. | Planificar. |
| **Baja** | Pruebas lentas, nombres que no dicen la regla, duplicadas, selectores frágiles que todavía no fallan. | Cuando convenga. |
| **Informativa** | Una decisión que conviene dejar explícita, una buena práctica, una idea para el inventario. | Opcional. |

## Estructura

```markdown
# Auditoría de pruebas: AAAA-MM-DD (<modo>)

- **Alcance:** <completa | cambios de <rama o PR> | área>. Commit: <sha corto>.
- **Auditoría anterior:** <archivo o "ninguna">.
- **Resumen:** <2–4 frases: cómo están las pruebas en general, lo más importante y cuántos hallazgos
  hay por severidad>.

## En números
- Pruebas: <n> unitarias, <n> de componentes, <n> de integración, <n> E2E.
- Cobertura: líneas <n> %, ramas <n> %, funciones <n> % (umbral: 85 / 80 / 80).
- Mutación: <puntaje> en <qué archivos y de cuándo: la corrida del lunes o una de cambios>.
- CI: <n> runs revisados, <n> con pruebas intermitentes.

## Hallazgos

### 1. <Título corto>: <Severidad> · <CONFIRMADO | PROBABLE>
- **Dónde:** `ruta/archivo.ts:línea` (y su prueba, si existe).
- **Qué pasa:** <en una o dos frases>.
- **Qué error no se detectaría:** <el cambio concreto que rompería algo sin que una prueba falle>.
- **Cómo se verificó:** <el mutante de Stryker, el error metido en un worktree y las pruebas que
  siguieron pasando, la salida del inventario o el run del CI>.
- **Arreglo propuesto:** <la prueba que se agrega y cómo se sabe que sirve: falla con el error, pasa
  sin él>. Rama sugerida: `test/<descripcion>`.

(Ordenados de mayor a menor severidad. Un hallazgo puede juntar varias líneas del inventario si
tienen la misma causa.)

## Pendientes de la auditoría anterior
| Hallazgo | Estado ahora |
|---|---|
| <título> | Resuelto en #<PR> · Sigue abierto · Ya no aplica |

## Lo que está bien
Una línea por área: qué se revisó y por qué está bien. Sirve para la próxima auditoría y para no
volver a revisarlo desde cero.

## Inventario y herramientas
- Inventario (`inventario.mjs`): <conteo por sección y qué se volvió hallazgo>.
- `pnpm test:coverage`: <resultado>.
- Stryker: <de dónde salió el reporte y su fecha; si es parcial, de qué archivos>.
- CI: <qué runs se revisaron y qué se encontró>.
- No se pudo revisar: <el reporte del lunes sin permiso para bajarlo, Docker apagado, etc.>.

## Descartados
Una línea por cada posible hallazgo descartado y por qué (un mutante equivalente, un archivo sin
lógica, una espera necesaria y explicada), para no volver a revisarlo.

## Próximos pasos
Plan de arreglos por prioridad, uno por rama, con la prueba de cada uno, y cuándo conviene la próxima
auditoría.
```
