// Dominios populares a los que sugerimos corregir.
const POPULAR_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "hotmail.es",
  "outlook.com",
  "outlook.es",
  "yahoo.com",
  "yahoo.es",
  "icloud.com",
  "live.com",
];

// Dominios reales que se parecen a los populares y no deben "corregirse".
const KNOWN_DOMAINS = new Set([
  ...POPULAR_DOMAINS,
  "mail.com",
  "email.com",
  "ymail.com",
  // Stryker disable StringLiteral: hoy ninguno está a 2 letras o menos de un dominio popular, así que sacarlo no cambia ninguna sugerencia; están para que no se "corrijan" si se sube el umbral
  "gmx.com",
  "aol.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  // Stryker restore StringLiteral
]);

/**
 * Si el dominio del correo parece un error de tipeo de un proveedor popular
 * (p. ej. "gmal.com", "hotmial.com", "gmail.co"), devuelve el correo corregido.
 */
export function suggestEmailCorrection(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at).trim();
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || KNOWN_DOMAINS.has(domain)) return null;

  let best: { domain: string; distance: number } | null = null;
  for (const candidate of POPULAR_DOMAINS) {
    const distance = levenshtein(domain, candidate);
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { domain: candidate, distance };
    }
  }
  return best ? `${local}@${best.domain}` : null;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = temp;
    }
  }
  return prev[b.length];
}
