// Las sesiones de una cuenta, legibles: el navegador y el sistema ("Chrome · Android") y la IP. Solo
// para mostrar en el detalle de una cuenta (el texto completo del navegador va en un title).

const BROWSERS: [RegExp, string][] = [
  // Antes que Chrome: Edge, Opera y Samsung Internet también dicen "Chrome".
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\b(OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(Chrome|CriOS|HeadlessChrome|Chromium)\//, "Chrome"],
  // Safari dice "Version/x Safari/y"; las vistas web de otras apps no traen "Version/".
  [/\bVersion\/.*\bSafari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/\b(iPhone|iPad|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\b(Macintosh|Mac OS X)\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

const match = (rules: [RegExp, string][], text: string) => rules.find(([pattern]) => pattern.test(text))?.[1] ?? null;

/** "Chrome · Android", "Safari · iOS"… o lo que se pueda reconocer. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent?.trim()) return "Dispositivo desconocido";
  const browser = match(BROWSERS, userAgent) ?? "Navegador desconocido";
  const system = match(SYSTEMS, userAgent);
  return system ? `${browser} · ${system}` : browser;
}

/** Los 8 grupos de una IPv6 como números, o null si no lo es (o trae una IPv4 al final). */
function ipv6Groups(ip: string): number[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const [left, right] = halves.map((half) => (half ? half.split(":") : []));
  const missing = 8 - left.length - (right?.length ?? 0);
  // Con "::" faltan uno o más grupos (los ceros que abrevia); sin él, tienen que estar los 8.
  if (right ? missing < 1 : missing !== 0) return null;
  const groups = [...left, ...Array<string>(right ? missing : 0).fill("0"), ...(right ?? [])];
  return groups.every((group) => /^[\da-f]{1,4}$/i.test(group)) ? groups.map((group) => parseInt(group, 16)) : null;
}

/**
 * La IP como se lee: una IPv4 tal cual; una IPv6 abreviada (RFC 5952: "2800:e2:0:0:…" → "2800:e2::").
 * Better Auth guarda las IPv6 recortadas a su red (/64, como las agrupa el límite de intentos): en ese
 * caso se muestra la red, "2800:e2:4a::/64".
 */
export function formatIp(ip: string | null | undefined): string {
  const text = ip?.trim() ?? "";
  if (!text) return "desconocida";
  // Una IPv4 (o cualquier otra cosa) no tiene los grupos de una IPv6: va tal cual.
  const groups = ipv6Groups(text);
  if (!groups) return text;

  // La racha de ceros más larga (de dos grupos o más; la primera, si empatan) se vuelve "::".
  let best = { start: -1, length: 1 };
  groups.forEach((_, start) => {
    let length = 0;
    while (groups[start + length] === 0) length++;
    if (length > best.length) best = { start, length };
  });
  const hex = groups.map((group) => group.toString(16));
  const short =
    best.start === -1
      ? hex.join(":")
      : `${hex.slice(0, best.start).join(":")}::${hex.slice(best.start + best.length).join(":")}`;
  return groups.slice(4).every((group) => group === 0) ? `${short}/64` : short;
}
