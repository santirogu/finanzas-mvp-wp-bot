# Plantilla del informe de la auditoría de textos

El informe va en `reports/textos/AAAA-MM-DD-<modo>/informe.md`, junto a lo que deja el inventario
(`marcas.md`, `textos-es.md`, `textos-en.md`). No se sube al repo. Escríbelo en español claro y
cuidado: es un informe sobre cómo se escribe, y lo lee el dueño del proyecto, no un lingüista.

## Escala de severidad

| Severidad | Cuándo | Qué hacer |
|---|---|---|
| **Crítica** | Un texto que puede hacer perder datos o dinero, o que promete algo falso: una confirmación de borrado que no dice que no se deshace, un monto o una fecha mal explicados, la política de privacidad diciendo algo que la app no hace. | Arreglo inmediato en `fix/…`. Si es de contenido legal, lo decide el dueño. |
| **Alta** | Un error de ortografía o de gramática a la vista de todos (el inicio de sesión, el Resumen, las respuestas del bot). Español en la app en inglés. Un botón o un error que no dice qué pasa o qué hacer. Una frase partida que no se entiende. Un texto que nombra un botón que ya no se llama así. | En los próximos días, en `fix/…`. |
| **Media** | Errores en pantallas de poco uso (el admin, la Ayuda). Palabras distintas para lo mismo. Frases de más de 30 palabras en textos para la persona. Redundancias, calcos y expresiones censuradas por el DPD. Un inglés que suena traducido. | Planificar. |
| **Baja** | Puntuación y tipografía que no cambian el sentido: comillas rectas, «...», títulos con punto, mayúsculas al estilo del inglés, el % sin su espacio. | Cuando convenga, juntas en un PR. |
| **Sugerencia** | Estilo sin regla: una frase más corta, un orden más claro, una palabra más común. | Opcional. Nunca bloquea un PR. |

## Estructura

```markdown
# Auditoría de textos: AAAA-MM-DD (<modo>)

- **Alcance:** <completa | cambios de <rama o PR> | área | página>. Commit: <sha corto>.
- **Auditoría anterior:** <carpeta o "ninguna">.
- **Resumen:** <2–4 frases: cómo está escrita la app en general, lo más importante y cuántos
  hallazgos hay por severidad>.

## En números
- Textos revisados: <n> en español y <n> en inglés, en <n> archivos.
- Marcas del inventario: <n> (<n> confirmadas, <n> descartadas).
- Hallazgos: <n> críticos, <n> altos, <n> medios, <n> bajos. Sugerencias: <n>.

## Hallazgos

### 1. <Título corto>: <Severidad> · <CONFIRMADO | PROBABLE>
- **Dónde:** `ruta/archivo.tsx:línea` (y dónde se ve: la página, la ventana, el mensaje del bot).
- **Dice:** «<texto actual, armado como se ve>».
- **Propuesta:** «<texto nuevo>». En inglés: «<texto nuevo>» (si cambia).
- **Por qué:** <la regla, con su fuente: DLE, DPD, Ortografía de 2010, FundéuRAE, el glosario>.
- **Cómo se verificó:** <el texto armado con sus datos, la prueba o la pantalla donde se vio>.
- **Pruebas que lo nombran:** <archivos que buscan el texto viejo, o "ninguna">.

(Ordenados de mayor a menor severidad. Un hallazgo puede juntar varios textos con el mismo error, por
ejemplo "comillas rectas en 12 textos", con la lista de dónde.)

## Sugerencias
| Dónde | Dice | Propuesta | Por qué |
|---|---|---|---|
| `archivo:línea` | «…» | «…» | <qué mejora> |

## Decisiones para el glosario
Lo que no tiene una respuesta única y conviene decidir una vez (por ejemplo, "45 %" o "45%"): las
opciones, qué dice la RAE, qué hace hoy la app y una recomendación.

## Pendientes de la auditoría anterior
| Hallazgo | Estado ahora |
|---|---|
| <título> | Resuelto en #<PR> · Sigue abierto · Ya no aplica |

## Lo que está bien
Una línea por área: qué se revisó y por qué está bien. Sirve para la próxima auditoría y para no
volver a revisarlo desde cero.

## Inventario
- `textos.mjs`: <marcas por tipo y cuántas se volvieron hallazgo>.
- No se pudo revisar: <lo que quedó fuera y por qué>.

## Descartados
Una línea por cada marca o posible hallazgo descartado y por qué (lo acepta el DPD, es un nombre
propio, lo decidió el glosario, es un estilo a propósito), para no volver a revisarlo.

## Próximos pasos
Plan de arreglos por prioridad, una rama por tema, con las pruebas que hay que cambiar en cada una, y
cuándo conviene la próxima auditoría.
```
