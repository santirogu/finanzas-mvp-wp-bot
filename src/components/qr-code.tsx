import { encode } from "uqr";

/**
 * Código QR dibujado en la app (SVG), sin servicios externos: el contenido (la clave de la
 * verificación en dos pasos) nunca sale del navegador. Siempre negro sobre blanco, también en modo
 * oscuro: así lo leen todas las cámaras.
 */
export function QrCode({ value, label, size = 208 }: { value: string; label: string; size?: number }) {
  const { data } = encode(value, { ecc: "M", border: 2 });
  const modules = data.length;
  const path = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : "")))
    .join("");
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${modules} ${modules}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-lg bg-white"
    >
      <rect width={modules} height={modules} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
