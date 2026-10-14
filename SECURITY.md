# Política de seguridad

Finanzas MVP maneja datos financieros personales, así que la seguridad es prioritaria.

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Repórtala de forma privada por una de estas vías:

1. **GitHub:** pestaña *Security* → **Report a vulnerability** (reporte privado).
2. **Correo:** santiagorock000@gmail.com, con el asunto "Vulnerabilidad en Finanzas MVP".

Incluye, si puedes: qué encontraste, cómo reproducirlo y qué impacto crees que tiene. Recibirás
una respuesta en un plazo de 7 días.

## Versión soportada

Solo la versión desplegada en producción (rama `main`).

## Qué se revisa automáticamente

- **CodeQL**: análisis estático del código y de los workflows en cada PR y cada semana.
- **Dependabot**: alertas y PRs de actualización ante vulnerabilidades en dependencias.
- **Secret scanning** con *push protection*: GitHub rechaza pushes que contengan credenciales.
- **`pnpm audit`** en el CI: falla ante vulnerabilidades altas o críticas en dependencias de producción.
