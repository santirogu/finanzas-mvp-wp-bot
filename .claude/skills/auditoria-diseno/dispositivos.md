# Dispositivos y navegadores de la auditoría

La lista que usa el recorrido está en `recorrido/dispositivos.ts`. Esta página explica por qué.

## Pantallas

| Grupo | Tamaño (px) | Representa | Por qué |
|---|---|---|---|
| Celular | 375 × 667 | iPhone SE / mini | El más angosto que se sigue usando |
| Celular | **393 × 852** | iPhone 16/17, Pixel | El tamaño más común (representativa) |
| Celular | 440 × 956 | iPhone 17 Pro Max | El celular del dueño |
| Celular | 956 × 440 | Celular horizontal | Poco alto, sobre todo con el teclado abierto; pasa el corte `sm` (640) |
| Tableta | 768 × 1024 | iPad mini vertical | Justo en el corte `md` (768) |
| Tableta | **820 × 1180** | iPad Air vertical | Una columna estirada, entre `md` y `lg` (representativa) |
| Tableta | 1180 × 820 | iPad Air horizontal | Dos columnas (`lg`, 1024), pero con el dedo y sin mouse |
| Computador | **1280 × 800** | Laptop | Representativa; aquí se recorre con el teclado |
| Computador | 1920 × 1080 | Monitor | El contenido centrado (`max-w-5xl`, 1024 px) en una pantalla ancha |
| Accesibilidad | 320 × 640 | Zoom al 400 % | WCAG 1.4.10: a 320 px de ancho todo se lee sin scroll de lado |
| Accesibilidad | 1280 × 800, letra 200 % | Letra grande del navegador | WCAG 1.4.4: el texto crece sin perderse ni taparse |

En **negrita**, las representativas: además se revisan en modo oscuro y con axe. Las demás, en modo
claro y con las medidas de diseño (que no dependen del color).

Los cortes de Tailwind de la app: `sm` 640, `md` 768, `lg` 1024 px. Los tamaños se eligieron para
caer a los dos lados de cada corte: ahí es donde un diseño cambia y donde suele romperse.

Pantallas táctiles (celulares, tabletas y 320 px): se exige letra de 16 px en los campos (si no,
Safari hace zoom) y se avisan las zonas táctiles de menos de 44 px.

## Navegadores

| Motor | Para qué | Cómo |
|---|---|---|
| **Chromium** | Todas las medidas, el teclado y los saltos al cargar (CLS). Es Chrome y Edge, y Chrome en Android. | Ya instalado para las E2E. |
| **WebKit** | El motor de Safari: cómo se ven los campos (fecha, `<select>`), las fuentes y algunos detalles de flex y grid en iPhone, iPad y Mac. | `pnpm exec playwright install webkit` (aprobado, solo en local). |
| **Simulador de iOS** | El Safari real: el zoom al tocar un campo, el selector de fecha nativo, la barra de abajo de Safari, el notch y las zonas seguras, la rotación. | Opcional: Xcode con la licencia aceptada (`sudo xcodebuild -license`, lo hace el dueño) y un runtime de iOS. |

WebKit de Playwright **no** es Safari de iOS: dibuja los campos como en la Mac y no hace el zoom al
tocar un campo. Por eso las medidas revisan el tamaño de letra (la causa) en vez del zoom (el
síntoma), y lo que solo se ve en un iPhone o un iPad va como PROBABLE y a la lista de "Para revisar
en tus dispositivos" del informe.

El iPad, por defecto, abre las páginas "como en computador" (se identifica como una Mac), pero el
ancho es el de la pantalla: el diseño que ve depende del ancho, como en la tabla.

## Modos de color

Cada vista representativa se captura en modo claro y oscuro (`prefers-color-scheme`), y axe revisa
el contraste en los dos. La app sigue el modo del sistema: no hay botón para cambiarlo.
