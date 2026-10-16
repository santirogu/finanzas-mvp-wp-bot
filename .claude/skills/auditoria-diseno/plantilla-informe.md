# Plantilla del informe de la auditoría de diseño

El informe va en `reports/diseno/AAAA-MM-DD-<modo>/informe.md`, junto a las capturas, la galería y
las medidas del recorrido. No se sube al repo. Escríbelo en español claro: lo lee el dueño del
proyecto, no un especialista en accesibilidad.

## Escala de severidad

| Severidad | Cuándo | Qué hacer |
|---|---|---|
| **Bloqueante** | Algo no se puede usar en un dispositivo o con una forma de uso: un botón fuera de la pantalla, un formulario que no se puede enviar con el teclado, texto ilegible en modo oscuro. | Arreglo inmediato en `fix/…` (o `hotfix/…` si ya está en producción y afecta a todos). |
| **Alta** | Molesta a casi todos en un dispositivo común, o excluye a alguien: el zoom de Safari al tocar un campo, contraste insuficiente, foco invisible, zonas táctiles de menos de 24 px pegadas. | En los próximos días, en `fix/…`. |
| **Media** | Se nota y estorba, pero hay cómo seguir: un texto cortado sin "…", una ventana que se sale en horizontal, borrar sin confirmación. | Planificar. |
| **Baja** | Detalle visual o de consistencia que se nota al compararlo: un espaciado distinto, un ícono desalineado. | Cuando convenga. |
| **Sugerencia** | Criterio de diseño, no defecto: aprovechar mejor el iPad, botones de 44 px, un texto más claro. | Opcional. Nunca bloquea un PR. |

## Estructura

```markdown
# Auditoría de diseño: AAAA-MM-DD (<modo>)

- **Alcance:** <completa | cambios de <rama o PR> | área | ruta>. Commit: <sha corto>.
  Vistas: <n>. Dispositivos: <lista o "los 11">. Motores: Chromium, WebKit<, simulador de iOS>.
- **Auditoría anterior:** <carpeta o "ninguna">.
- **Galería:** [galeria.html](galeria.html) (doble clic para abrirla).
- **Resumen:** <2–4 frases: cómo se ve y se usa la app en general, lo más importante y cuántos
  hallazgos hay por severidad>.

## Hallazgos

### 1. <Título corto>: <Severidad> · <CONFIRMADO | PROBABLE>
- **Dónde se ve:** <vistas>, en <dispositivos> (<motores>).
- **Qué pasa:** <lo que ve o le pasa a la persona, en una o dos frases>.
- **A quién afecta:** <quién y cuándo: "todas las personas con iPad al registrar un movimiento">.
- **Evidencia:** ![<vista> en <dispositivo>](capturas/<motor>/<vista>/<dispositivo>-claro.jpg) y la
  medida (`resumen.txt`: <tipo y valor>).
- **Causa:** `ruta/archivo.tsx:línea`: <por qué pasa>.
- **Arreglo propuesto:** <el cambio>. Rama sugerida: `fix/<descripcion>`.
- **Prueba de regresión:** <qué se agrega: una medida en `e2e/diseno-tactil.spec.ts`, un caso de
  axe en `e2e/accesibilidad.spec.ts`, una prueba de componente, o "no se puede medir: revisión
  visual">.

(Ordenados de mayor a menor severidad. Un hallazgo puede juntar varios grupos de `resumen.txt` si
tienen la misma causa.)

## Sugerencias de diseño
Una por tema, con su captura y el porqué. No son defectos: la persona decide.

## Pendientes de la auditoría anterior
| Hallazgo | Estado ahora |
|---|---|
| <título> | Resuelto en #<PR> · Sigue abierto · Ya no aplica |

## Lo que está bien
Una línea por área: qué se revisó y por qué está bien (responsividad, modo oscuro, contraste,
teclado, textos…). Sirve para la próxima auditoría y para no volver a revisarlo desde cero.

## Medidas automáticas
- Recorrido: <n> vistas × <n> dispositivos × <motores>: <n> capturas. Vistas que no se pudieron
  recorrer: <ninguna o cuáles y por qué>.
- Defectos medidos: <conteo por tipo>. Avisos: <conteo por tipo>.
- axe (WCAG 2.2 A y AA): <resultado en claro y oscuro>.
- Teclado: <resultado del recorrido con Tab>.
- No se pudo revisar: <el simulador de iOS, un motor, etc., y por qué>.

## Descartados
Una línea por cada posible hallazgo descartado (sobre todo falsos positivos de las medidas) y por
qué, para no volver a revisarlo.

## Para revisar en tus dispositivos
La lista de la sección 7 del checklist, adaptada a esta auditoría (unos 5 minutos).

## Próximos pasos
Plan de arreglos por prioridad, uno por rama, con su prueba de regresión, y cuándo conviene la
próxima auditoría.
```
