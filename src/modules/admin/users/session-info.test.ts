import { describe, expect, it } from "vitest";
import { describeUserAgent, formatIp } from "./session-info";

// Navegadores reales (copiados tal cual los mandan).
const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  firefoxWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
  firefoxIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  edgeAndroid:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0",
  operaWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/122.0.0.0",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  chromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  headless:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
  // La vista web de una app (p. ej. al abrir un enlace desde Instagram): sin "Version/".
  webviewIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0",
};

describe("describeUserAgent", () => {
  it.each([
    [UA.chromeMac, "Chrome · macOS"],
    [UA.chromeAndroid, "Chrome · Android"],
    [UA.chromeIphone, "Chrome · iOS"],
    [UA.safariIphone, "Safari · iOS"],
    [UA.safariMac, "Safari · macOS"],
    [UA.firefoxWindows, "Firefox · Windows"],
    [UA.firefoxLinux, "Firefox · Linux"],
    [UA.firefoxIphone, "Firefox · iOS"],
    [UA.edgeWindows, "Edge · Windows"],
    [UA.edgeAndroid, "Edge · Android"],
    [UA.operaWindows, "Opera · Windows"],
    [UA.samsung, "Samsung Internet · Android"],
    [UA.chromebook, "Chrome · ChromeOS"],
    [UA.ipad, "Safari · iOS"],
    [UA.headless, "Chrome · Linux"],
    [UA.webviewIphone, "Navegador desconocido · iOS"],
  ])("%s → %s", (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toBe(expected);
  });

  it("sin sistema reconocible, solo el navegador", () => {
    expect(describeUserAgent("Firefox/143.0")).toBe("Firefox");
    expect(describeUserAgent("curl/8.7.1")).toBe("Navegador desconocido");
  });

  it.each([null, undefined, "", "   "])("sin navegador (%j): dispositivo desconocido", (userAgent) => {
    expect(describeUserAgent(userAgent)).toBe("Dispositivo desconocido");
  });
});

describe("formatIp", () => {
  it.each([
    // IPv4, tal cual.
    ["181.50.12.3", "181.50.12.3"],
    ["  181.50.12.3 ", "181.50.12.3"],
    // Las IPv6 como las guarda Better Auth (la red /64, el resto en ceros).
    ["2800:00e2:004a:1234:0000:0000:0000:0000", "2800:e2:4a:1234::/64"],
    ["2800:00E2:004A:1234:0000:0000:0000:0000", "2800:e2:4a:1234::/64"],
    ["0000:0000:0000:0000:0000:0000:0000:0000", "::/64"],
    ["2800:0000:0000:1234:0000:0000:0000:0000", "2800:0:0:1234::/64"],
    // IPv6 completas, abreviadas (RFC 5952).
    ["2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1"],
    ["2001:db8::1", "2001:db8::1"],
    ["::1", "::1"],
    // Las que ya vienen abreviadas también se escriben como manda la norma.
    ["2001:0db8::0001", "2001:db8::1"],
    ["2001:db8:0:0::1", "2001:db8::1"],
    ["::0001", "::1"],
    ["::", "::/64"],
    ["2800:e2:4a:1234::", "2800:e2:4a:1234::/64"],
    // "::" en lugar de un solo grupo: ese cero no se abrevia.
    ["1:2:3:4:5:6::7", "1:2:3:4:5:6:0:7"],
    ["1:2:3:4:5:6:7:8", "1:2:3:4:5:6:7:8"],
    // Un solo cero no se abrevia; entre dos rachas, la más larga, y si empatan, la primera.
    ["2001:db8:0:1:1:1:1:1", "2001:db8:0:1:1:1:1:1"],
    ["1:0:0:2:0:0:0:3", "1:0:0:2::3"],
    ["1:0:0:2:3:0:0:4", "1::2:3:0:0:4"],
    ["2001:db8:0:0:1:0:0:0", "2001:db8:0:0:1::"],
  ])("%j → %s", (ip, expected) => {
    expect(formatIp(ip)).toBe(expected);
  });

  it.each([
    "fe80::1::2",
    "1:2:3:4:5:6:7",
    "1:0:0:0:0:0:0",
    "1:2:3:4:5:6:7:8:9",
    "1:0:0:0:0:0:0:0:0",
    "1:2:3:4:5:6:7::8",
    "12345::1",
    "g::1",
    "::ffff:1.2.3.4",
    "local",
  ])(
    "lo que no es una IP conocida se muestra tal cual: %j",
    (ip) => {
      expect(formatIp(ip)).toBe(ip);
    },
  );

  it.each([null, undefined, "", "  "])("sin IP (%j): desconocida", (ip) => {
    expect(formatIp(ip)).toBe("desconocida");
  });
});
