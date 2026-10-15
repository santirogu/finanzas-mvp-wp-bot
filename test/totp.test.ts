import { describe, expect, it } from "vitest";
import { base32Decode, secretFromUri, totp } from "./totp";

// Vectores de prueba del RFC 6238 (apéndice B), clave ASCII "12345678901234567890" en SHA-1.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp (el generador de códigos de las pruebas)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ])("en el segundo %d da %s, como el RFC 6238", (seconds, expected) => {
    expect(totp(RFC_SECRET, seconds * 1000, { digits: 8 })).toBe(expected);
  });

  it("con 6 dígitos son los últimos 6 del de 8", () => {
    expect(totp(RFC_SECRET, 59_000)).toBe("287082");
  });

  it("cambia cada 30 segundos", () => {
    expect(totp(RFC_SECRET, 30_000)).toBe(totp(RFC_SECRET, 59_999));
    expect(totp(RFC_SECRET, 59_999)).not.toBe(totp(RFC_SECRET, 60_000));
  });

  it("decodifica base32 sin importar mayúsculas, espacios ni relleno", () => {
    expect(base32Decode("gezd gnbv-gy3t qojq====").toString()).toBe("1234567890");
    expect(() => base32Decode("0189")).toThrow("Carácter base32 inválido");
  });

  it("saca la clave del URI del QR", () => {
    expect(secretFromUri("otpauth://totp/Finanzas%20MVP:ana@x.co?secret=ABC234&issuer=Finanzas%20MVP")).toBe("ABC234");
    expect(() => secretFromUri("otpauth://totp/x?issuer=y")).toThrow("no trae la clave");
  });
});
