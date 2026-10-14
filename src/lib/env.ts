/**
 * Lee una variable de entorno sin espacios ni saltos de línea en los extremos.
 * Al pegar secretos en paneles como Vercel es fácil arrastrar un "\n" final,
 * que rompe comparaciones exactas (token del webhook) o cabeceras HTTP.
 */
export function envVar(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}
