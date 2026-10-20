// El escudo de admin: el de la etiqueta y el del círculo de la cuenta (src/components/admin-badge.tsx,
// que dibuja el servidor) y el de la pestaña Admin (src/app/[lang]/(app)/nav-tabs.tsx, de cliente).
const SHIELD =
  "M9.661 2.237a.531.531 0 0 1 .678 0 11.947 11.947 0 0 0 7.078 2.749.5.5 0 0 1 .479.425c.069.52.104 1.05.104 1.59 0 5.162-3.26 9.563-7.834 11.256a.48.48 0 0 1-.332 0C5.26 16.564 2 12.163 2 7c0-.538.035-1.069.104-1.589a.5.5 0 0 1 .48-.425 11.947 11.947 0 0 0 7.077-2.75Zm4.196 5.954a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z";

/** El escudo solo, decorativo (quien lo usa ya dice "Admin" en el texto o en su nombre). */
export function ShieldIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path fillRule="evenodd" d={SHIELD} clipRule="evenodd" />
    </svg>
  );
}
