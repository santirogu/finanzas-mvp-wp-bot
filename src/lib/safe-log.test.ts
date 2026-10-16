import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, logAuthSafely } from "./safe-log";

const queryError = () => {
  const error = new Error('Failed query: insert into "whatsapp_message" values ($1, $2)\nparams: wamid.1,573001112233,gasté 80 mil en farmacia');
  error.name = "DrizzleQueryError";
  return Object.assign(error, { cause: Object.assign(new Error("invalid byte sequence"), { code: "22021" }) });
};

afterEach(() => vi.restoreAllMocks());

describe("describeError", () => {
  it("da el tipo y el código de Postgres, nunca el mensaje", () => {
    const description = describeError(queryError());
    expect(description).toBe("DrizzleQueryError (22021)");
    expect(description).not.toMatch(/573001112233|farmacia|params/);
  });

  it("el código puede venir en el propio error", () => {
    expect(describeError(Object.assign(new Error("dup"), { name: "PostgresError", code: "23505" }))).toBe("PostgresError (23505)");
    expect(describeError(Object.assign(new Error("x"), { code: 42 }))).toBe("Error (42)");
  });

  it("sin código, solo el tipo", () => {
    expect(describeError(new TypeError("no se pudo leer ana@correo.com"))).toBe("TypeError");
    expect(describeError(Object.assign(new Error("x"), { code: { raro: true } }))).toBe("Error");
  });

  it.each(["texto con datos", 42, null, undefined, { message: "ana@correo.com" }])("lo que no es un error (%j) no se describe", (value) => {
    expect(describeError(value)).toBe("error desconocido");
  });
});

describe("logAuthSafely", () => {
  it("escribe el mensaje de Better Auth sin los parámetros, y de los errores solo el tipo", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logAuthSafely("error", "Failed to create user\nparams: ana@correo.com,Ana,scrypt$hash", queryError(), "ana@correo.com", { email: "ana@correo.com" });
    expect(error).toHaveBeenCalledWith("[auth] Failed to create user", "DrizzleQueryError (22021)");
  });

  it("cada nivel va a su consola", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logAuthSafely("warn", "secreto corto");
    logAuthSafely("info", "listo");
    logAuthSafely("debug", "detalle");
    expect(warn).toHaveBeenCalledWith("[auth] secreto corto");
    expect(info).toHaveBeenNthCalledWith(1, "[auth] listo");
    expect(info).toHaveBeenNthCalledWith(2, "[auth] detalle");
  });

  it("recorta un mensaje muy largo", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logAuthSafely("warn", "x".repeat(1000));
    expect(warn.mock.calls[0][0]).toHaveLength("[auth] ".length + 300);
  });
});
