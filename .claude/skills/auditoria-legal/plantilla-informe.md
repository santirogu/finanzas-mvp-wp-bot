# Plantilla del informe de la auditoría legal

El informe va en `reports/legal/AAAA-MM-DD-<modo>.md`. No se sube al repo. Escríbelo en español claro: lo lee
el dueño, no un abogado, y le sirve para llevarle al abogado las preguntas que quedan.

## Escala de severidad

| Severidad | Cuándo | Qué hacer |
|---|---|---|
| **Crítica** | La app trata datos sin la autorización, los comparte con alguien que la política no nombra, guarda datos sensibles o de menores sin lo que exige la ley, o no borra lo que promete borrar. | Arreglo inmediato en `fix/…`, y consultar al abogado. |
| **Alta** | Falta algo que la norma exige textualmente (un elemento del art. 13 del Decreto 1377, un derecho, un plazo), o la política no menciona un dato que la app guarda. | En los próximos días, en `fix/…`. |
| **Media** | La app cumple, pero de forma incompleta o difícil de probar: un procedimiento que no está escrito, un aviso que solo está en una página. | Planificar. |
| **Baja** | Claridad o consistencia entre las páginas legales, sin un requisito que falte. | Cuando convenga, junto con otro arreglo. |
| **Informativa** | Algo que conviene dejar por escrito o revisar si cambia la situación (por ejemplo, si se constituye una empresa). | Opcional. |

## Estructura

```markdown
# Auditoría legal — AAAA-MM-DD (<modo>)

> No es asesoría legal: compara la app con lo que la norma dice por escrito. Las preguntas que piden
> interpretarla están en "Para revisar con un abogado".

- **Alcance:** <completa | cambios de <rama o PR> | área>. Commit: <sha corto>.
- **Auditoría anterior:** <archivo o "ninguna">.
- **Resumen:** <2–4 frases: cómo está la app frente a la ley, lo más importante y cuántos hallazgos hay por
  severidad>.

## Hallazgos

### 1. <Título corto> — <Severidad> · <INCUMPLE | RIESGO>
- **Norma:** <Ley 1581 de 2012, art. 12 lit. b> (<fuente consultada>).
- **Qué exige:** <una frase>.
- **Qué hace la app:** <una o dos frases, con `ruta/archivo.ts:línea` o la página>.
- **Arreglo propuesto:** <el cambio, si sube `PRIVACY_VERSION` y la prueba que lo cubre>. Rama sugerida:
  `fix/<descripcion>`.

(Ordenados de mayor a menor severidad.)

## Para revisar con un abogado

| Pregunta | Por qué | Norma |
|---|---|---|
| <la pregunta concreta, que se pueda responder> | <qué depende de la respuesta> | <artículo> |

## Lo que está bien

- <lo que se revisó y cumple, en una línea cada uno, con su norma>.

## Pendientes de la auditoría anterior

| Hallazgo o pregunta | Estado ahora |
|---|---|
| <título> | Resuelto en #<PR> · Sigue abierto · Respondido por el abogado · Ya no aplica |

## Descartado

- <posible hallazgo>: <por qué no lo es, en una línea>.

## Fuentes consultadas

- <norma>: <dirección> (consultada el AAAA-MM-DD).
```
