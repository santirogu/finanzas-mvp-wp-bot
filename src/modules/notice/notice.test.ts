import { describe, expect, it } from "vitest";
import {
  cleanNoticeText,
  isNoticeTone,
  NOTICE_COOKIE,
  noticeCookie,
  noticeEndBounds,
  noticeVersion,
  parseBogotaDateTime,
  toBogotaDateTime,
} from "./notice";

describe("la fecha de fin, en hora de Colombia", () => {
  it.each([
    ["2026-10-25T20:00", "2026-10-26T01:00:00.000Z"],
    ["2026-10-25T00:00", "2026-10-25T05:00:00.000Z"],
    // Fin de año: en UTC ya es el año siguiente.
    ["2026-12-31T23:59", "2027-01-01T04:59:00.000Z"],
    [" 2026-10-25T08:30 ", "2026-10-25T13:30:00.000Z"],
  ])("%s → %s", (value, iso) => {
    expect(parseBogotaDateTime(value)?.toISOString()).toBe(iso);
  });

  it.each([["2026-02-30T10:00"], ["2026-10-25T24:00"], ["2026-10-25T10:60"], ["2026-10-25 10:00"], ["2026-10-25"], [""], [null], [42]])(
    "%j no es una fecha",
    (value) => {
      expect(parseBogotaDateTime(value)).toBeNull();
    },
  );

  it("ida y vuelta, como lo muestra el campo", () => {
    const date = new Date("2026-10-26T01:00:00.000Z");
    expect(toBogotaDateTime(date)).toBe("2026-10-25T20:00");
    expect(parseBogotaDateTime(toBogotaDateTime(date))).toEqual(date);
  });

  it("puede ir desde ahora hasta 31 días después", () => {
    const now = new Date("2026-10-23T15:00:00Z");
    const { min, max } = noticeEndBounds(now);
    expect(min).toEqual(now);
    expect(max.toISOString()).toBe("2026-11-23T15:00:00.000Z");
  });
});

describe("el texto", () => {
  it.each([
    ["  Mantenimiento   el sábado\n de 8 a 9  ", "Mantenimiento el sábado de 8 a 9"],
    ["Nuevo:\tpresupuestos", "Nuevo: presupuestos"],
    ["Hola\u0000mundo", "Holamundo"],
    ["   ", ""],
    [undefined, ""],
    [123, ""],
  ])("%j → %j", (value, expected) => {
    expect(cleanNoticeText(value)).toBe(expected);
  });
});

describe("el tipo, la versión y la cookie", () => {
  it("solo los dos tipos", () => {
    expect(isNoticeTone("info")).toBe(true);
    expect(isNoticeTone("important")).toBe(true);
    expect(isNoticeTone("danger")).toBe(false);
    expect(isNoticeTone(undefined)).toBe(false);
  });

  it("la versión cambia con cada publicación", () => {
    expect(noticeVersion(new Date("2026-10-23T15:00:00.000Z"))).toBe("1792767600000");
    expect(noticeVersion(new Date("2026-10-23T15:00:00.001Z"))).not.toBe(noticeVersion(new Date("2026-10-23T15:00:00.000Z")));
  });

  it("la cookie, para todo el sitio por 32 días y, con https, segura", () => {
    expect(NOTICE_COOKIE).toBe("aviso-cerrado");
    expect(noticeCookie("123", false)).toBe("aviso-cerrado=123; Path=/; Max-Age=2764800; SameSite=Lax");
    expect(noticeCookie("123", true)).toBe("aviso-cerrado=123; Path=/; Max-Age=2764800; SameSite=Lax; Secure");
  });
});
