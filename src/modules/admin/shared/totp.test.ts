import { describe, expect, it } from "vitest";
import { base32Encode, totp } from "../../../../test/totp";
import { TOTP_PERIOD_SECONDS, cleanCode, hotp, isCodeFormat, matchingStep, timeStep } from "./totp";

// La clave de los vectores de prueba del RFC 6238 (SHA-1): "12345678901234567890" en ASCII.
const RFC_SECRET = "12345678901234567890";
const at = (seconds: number) => new Date(seconds * 1000);

describe("hotp", () => {
  // RFC 6238, apéndice B: los códigos de 8 dígitos; aquí, sus últimos 6.
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("en el segundo %i da %s", (seconds, code) => {
    expect(hotp(RFC_SECRET, timeStep(at(seconds)))).toBe(code);
  });

  it("da lo mismo que Google Authenticator con la clave del QR (base32)", () => {
    const secret = "clave-de-prueba-de-32-caracteres";
    for (const seconds of [0, 1_760_000_000, 1_760_000_029, 1_760_000_030, 4_102_444_800]) {
      expect(hotp(secret, timeStep(at(seconds))), String(seconds)).toBe(totp(base32Encode(secret), seconds * 1000));
    }
  });
});

describe("timeStep", () => {
  it("cambia cada 30 segundos", () => {
    expect(TOTP_PERIOD_SECONDS).toBe(30);
    expect(timeStep(at(0))).toBe(0);
    expect(timeStep(new Date(29_999))).toBe(0);
    expect(timeStep(at(30))).toBe(1);
    expect(timeStep(at(1_760_000_000))).toBe(58_666_666);
  });
});

describe("cleanCode e isCodeFormat", () => {
  it("quita los espacios y exige exactamente 6 dígitos", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(isCodeFormat("123456")).toBe(true);
    expect(isCodeFormat("000000")).toBe(true);
    for (const code of ["", "12345", "1234567", "12345a", "١٢٣٤٥٦", "123 456", "12345\n"]) {
      expect(isCodeFormat(code), JSON.stringify(code)).toBe(false);
    }
  });
});

describe("matchingStep", () => {
  const now = at(1_760_000_015);
  const step = timeStep(now);

  it("acepta el código de ahora, el anterior y el siguiente, y dice de qué período es", () => {
    expect(matchingStep(RFC_SECRET, hotp(RFC_SECRET, step), now)).toBe(step);
    expect(matchingStep(RFC_SECRET, hotp(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchingStep(RFC_SECRET, hotp(RFC_SECRET, step + 1), now)).toBe(step + 1);
  });

  it("rechaza los de hace o dentro de más de 30 segundos", () => {
    expect(matchingStep(RFC_SECRET, hotp(RFC_SECRET, step - 2), now)).toBeNull();
    expect(matchingStep(RFC_SECRET, hotp(RFC_SECRET, step + 2), now)).toBeNull();
  });

  it("rechaza un código de otra clave o uno inventado", () => {
    expect(matchingStep(RFC_SECRET, hotp("otra-clave", step), now)).toBeNull();
    const taken = new Set([-1, 0, 1].map((offset) => hotp(RFC_SECRET, step + offset)));
    const wrong = ["000000", "123456", "999999"].find((code) => !taken.has(code))!;
    expect(matchingStep(RFC_SECRET, wrong, now)).toBeNull();
  });

  it.each(["", "12345", "1234567", "abcdef", "12 345"])("con algo que no es un código (%j), null", (code) => {
    expect(matchingStep(RFC_SECRET, code, now)).toBeNull();
  });
});
