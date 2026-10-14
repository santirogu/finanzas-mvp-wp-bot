// Cabeceras de seguridad de todas las respuestas (las aplica next.config.ts).
//
// CSP sin nonces: con nonces Next obliga a renderizar todo dinámicamente y no permite el
// prerenderizado parcial que usa esta app (cacheComponents). Por eso los scripts en línea de Next
// necesitan 'unsafe-inline' (guía de Next 16: "Content Security Policy → Without Nonces"). Aun
// así, la política bloquea scripts y conexiones a otros dominios, que embeban la app en un iframe
// (clickjacking), plugins, cambios de <base> y formularios que envíen datos afuera.

type Header = { key: string; value: string };

export function contentSecurityPolicy({ dev = false } = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Solo en desarrollo: 'unsafe-eval' (React lo usa para reconstruir los stack traces) y el
    // script de depuración de Vercel Web Analytics, que solo escribe en la consola. En
    // producción la analítica se sirve desde la propia app ('self').
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'", "https://va.vercel-scripts.com"] : []),
    ],
    // Los estilos en línea (style="width: …") son de React, no de terceros.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    // El navegador solo habla con la propia app (en desarrollo, también con el WebSocket de HMR).
    "connect-src": ["'self'", ...(dev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders({ dev = false } = {}): Header[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev }) },
    // Vercel ya la manda en *.vercel.app; aquí también sirve para un dominio propio.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Para navegadores viejos que no entienden frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];
}
