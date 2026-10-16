// Las pantallas del recorrido (dispositivos.md explica por qué cada una). Las "representativas" (una
// por grupo) también se revisan en modo oscuro y con axe: el resto, solo en modo claro y con las
// medidas de diseño, que no dependen del color.

export type Grupo = "celular" | "tableta" | "computador" | "accesibilidad";

export type Dispositivo = {
  id: string;
  grupo: Grupo;
  nombre: string;
  ancho: number;
  alto: number;
  /** Pantalla táctil: se exige letra de 16 px en los campos y zonas táctiles de 44 px. */
  tactil: boolean;
  escala: number;
  representativo?: boolean;
  /** Letra de la página más grande que la normal (2 = 200 %), como quien sube la letra del navegador. */
  letra?: number;
};

export const DISPOSITIVOS: Dispositivo[] = [
  { id: "celular-375", grupo: "celular", nombre: "iPhone SE / mini", ancho: 375, alto: 667, tactil: true, escala: 2 },
  { id: "celular-393", grupo: "celular", nombre: "iPhone 16/17, Pixel", ancho: 393, alto: 852, tactil: true, escala: 3, representativo: true },
  { id: "celular-440", grupo: "celular", nombre: "iPhone 17 Pro Max", ancho: 440, alto: 956, tactil: true, escala: 3 },
  { id: "celular-horizontal", grupo: "celular", nombre: "Celular horizontal", ancho: 956, alto: 440, tactil: true, escala: 3 },
  { id: "tableta-768", grupo: "tableta", nombre: "iPad mini vertical", ancho: 768, alto: 1024, tactil: true, escala: 2 },
  { id: "tableta-820", grupo: "tableta", nombre: "iPad Air vertical", ancho: 820, alto: 1180, tactil: true, escala: 2, representativo: true },
  { id: "tableta-1180", grupo: "tableta", nombre: "iPad Air horizontal", ancho: 1180, alto: 820, tactil: true, escala: 2 },
  { id: "computador-1280", grupo: "computador", nombre: "Laptop", ancho: 1280, alto: 800, tactil: false, escala: 1, representativo: true },
  { id: "computador-1920", grupo: "computador", nombre: "Monitor", ancho: 1920, alto: 1080, tactil: false, escala: 1 },
  { id: "reflujo-320", grupo: "accesibilidad", nombre: "320 px (zoom al 400 %, WCAG 1.4.10)", ancho: 320, alto: 640, tactil: true, escala: 2 },
  { id: "letra-200", grupo: "accesibilidad", nombre: "Letra al 200 % (WCAG 1.4.4)", ancho: 1280, alto: 800, tactil: false, escala: 1, letra: 2 },
];

export const GRUPOS: Grupo[] = ["celular", "tableta", "computador", "accesibilidad"];
