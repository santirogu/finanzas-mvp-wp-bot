import mark from "./brand-mark.json";

// La marca de la app: el nombre (el mismo en todos los idiomas) y el dibujo del logo, un globo de chat
// con un ✓ (lo que hace el bot: le escribes y queda anotado). El dibujo está en brand-mark.json: lo usan
// el componente Logo (src/components/logo.tsx) y el script que genera los íconos y la imagen para
// compartir (scripts/brand-assets.mjs). Los colores son los de --brand y --brand-foreground (modo claro).

export const BRAND_NAME = "Anotado";

export const BRAND_MARK = mark;
