import mark from "./brand-mark.json";

// La marca de la app: el nombre (el mismo en todos los idiomas) y el dibujo del logo, la "A" de Anotado
// escrita con un lápiz y cruzada por un ✓ (le escribes y queda anotado). El dibujo está en brand-mark.json:
// - letter: la "A" (con relleno), con la pierna izquierda como el cuerpo del lápiz;
// - tip: la punta del lápiz (con relleno y un borde de tipRound, para redondear sus esquinas);
// - check: el ✓ (un trazo de checkWidth), sobre el mismo trazo más ancho (checkCutWidth) del color del fondo,
//   que corta la "A" alrededor del ✓.
// Lo usan el componente Logo (src/components/logo.tsx), el PDF (src/modules/reports/pdf/document.tsx) y el script
// que genera los íconos y la imagen para compartir (scripts/brand-assets.mjs). Los colores son los de --brand y
// --brand-foreground (modo claro).

export const BRAND_NAME = "Anotado";

export const BRAND_MARK = mark;
