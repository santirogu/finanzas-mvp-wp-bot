import { describe, expect, it } from "vitest";
import { PHOTO_MAX_DAYS_BACK, photoMediaType } from "./photo";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("photoMediaType", () => {
  it("reconoce JPEG, PNG y WebP por sus primeros bytes", () => {
    expect(photoMediaType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(photoMediaType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    // RIFF, el tamaño (cualquiera) y WEBP.
    expect(photoMediaType(bytes(0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });

  it("no acepta lo demás, aunque se le parezca", () => {
    expect(photoMediaType(bytes())).toBeNull();
    expect(photoMediaType(bytes(0xff, 0xd8))).toBeNull();
    // Un PNG al que le falta el último byte de la firma.
    expect(photoMediaType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a))).toBeNull();
    // RIFF de un audio (WAVE), no de una imagen.
    expect(photoMediaType(bytes(0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x41, 0x56, 0x45))).toBeNull();
    // Un GIF (WhatsApp los manda como video) o un PDF.
    expect(photoMediaType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(photoMediaType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });

  it("la fecha impresa vale hasta un mes atrás", () => {
    expect(PHOTO_MAX_DAYS_BACK).toBe(31);
  });
});
