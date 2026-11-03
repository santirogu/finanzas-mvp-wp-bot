// Las fotos de facturas (README → Bot de WhatsApp): qué imágenes se le mandan a Claude y hasta cuándo vale la
// fecha impresa. Sin dependencias, para probarlas solas.

/** Los formatos de foto que se le mandan a Claude (WhatsApp manda las fotos en JPEG o PNG). */
export type PhotoMediaType = "image/jpeg" | "image/png" | "image/webp";

/** La foto lista para Claude: en base64, con su formato. */
export type PhotoImage = { data: string; mediaType: PhotoMediaType };

/**
 * Hasta cuántos días atrás vale la fecha impresa en una factura. Una más vieja (o futura) queda con la de hoy:
 * casi siempre es una foto vieja que la persona está registrando ahora, o una fecha mal leída.
 */
export const PHOTO_MAX_DAYS_BACK = 31;

const startsWith = (data: Uint8Array, bytes: readonly number[], offset = 0) => bytes.every((byte, i) => data[offset + i] === byte);

/**
 * El formato de una imagen por sus primeros bytes, no por lo que diga el mensaje: así una imagen con el tipo
 * equivocado no hace fallar la llamada a Claude. null si no es uno de los de PhotoMediaType.
 */
export function photoMediaType(data: Uint8Array): PhotoMediaType | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // RIFF….WEBP: los bytes 4 a 7 son el tamaño.
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}
