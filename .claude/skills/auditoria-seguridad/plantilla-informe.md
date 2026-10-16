# Plantilla del informe de auditoría

El informe va en `reports/seguridad/AAAA-MM-DD-<modo>.md`. Nunca se sube al repo, porque es público.
Escríbelo en español claro: lo lee el dueño del proyecto, no solo un especialista.

## Escala de severidad

| Severidad | Cuándo | Qué hacer |
|---|---|---|
| **Crítica** | Sin cuenta, o con una cuenta normal, se pueden leer o cambiar datos de otras personas, tomar una cuenta (incluida la del admin), ejecutar código en el servidor o sacar secretos. | Arreglo inmediato en `hotfix/…`, antes que cualquier otra cosa. |
| **Alta** | Explotable en condiciones razonables (con una cuenta propia o con un enlace), o anula un control clave: dos pasos, firma del webhook, límite de intentos, suspensión. También si expone datos personales. | En los próximos días, en `fix/…`. |
| **Media** | Requiere condiciones poco comunes, o el impacto es limitado: abuso de costos de la API, enumeración de cuentas, una cabecera débil, un log con más datos de los necesarios. | Planificar. |
| **Baja** | Endurecimiento o defensa en profundidad: no se explota solo, pero sumado a otro fallo ayuda. | Cuando convenga. |
| **Informativa** | Buena práctica, observación o decisión que conviene dejar explícita. | Opcional. |

## Estructura

```markdown
# Auditoría de seguridad — AAAA-MM-DD (<modo>)

- **Alcance:** <completa | cambios de <rama o PR> | área>. Commit: <sha corto>.
- **Auditoría anterior:** <archivo o "ninguna">.
- **Resumen:** <2–4 frases: estado general, lo más importante, cuántos hallazgos por severidad>.

## Hallazgos

### 1. <Título corto> — <Severidad> · <CONFIRMADO | PROBABLE>
- **Dónde:** `ruta/archivo.ts:línea`
- **Qué pasa:** <el fallo, en una o dos frases>.
- **Escenario:** <quién, con qué acceso, qué hace y qué obtiene>.
- **Cómo se verificó:** <prueba en local, `curl` a localhost o lectura del código, con la ruta del
  script en el scratchpad si existe>.
- **Arreglo propuesto:** <el cambio y la prueba que lo cubre>. Rama sugerida: `fix/<descripcion>`.

(Ordenados de mayor a menor severidad.)

## Pendientes de la auditoría anterior
| Hallazgo | Estado ahora |
|---|---|
| <título> | Resuelto en #<PR> · Sigue abierto · Ya no aplica |

## Controles revisados que están bien
Una línea por área: qué se revisó y por qué está bien. Sirve para la próxima auditoría y para no
volver a revisarlo desde cero.

## Herramientas automáticas
- `pnpm audit`: <resumen>.
- Dependabot, CodeQL y escaneo de secretos de GitHub: <alertas abiertas o "sin alertas">.
- Pruebas de seguridad (matriz de autorización, cabeceras, formularios): <resultado>.
- Último ZAP del CI: <pasó / falló, en el commit>.
- No se pudo revisar: <lo que respondió 403, lo que no aplica, etc.>.

## Descartados
Una línea por cada posible hallazgo descartado y por qué, para no volver a revisarlo.

## Próximos pasos
Plan de arreglos por prioridad, uno por rama, y cuándo conviene la próxima auditoría.
```
