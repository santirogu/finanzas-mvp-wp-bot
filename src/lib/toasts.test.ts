import { describe, expect, it } from "vitest";
import { TOAST_PARAM, URL_TOASTS, urlToast, withoutParams } from "./toasts";

describe("urlToast", () => {
  it("da el aviso de cada código en sus páginas", () => {
    expect(TOAST_PARAM).toBe("aviso");
    expect(urlToast("guardado", "/egresos")).toEqual({ tone: "success", message: "Cambios guardados" });
    expect(urlToast("guardado", "/ingresos")).toEqual({ tone: "success", message: "Cambios guardados" });
    expect(urlToast("cuenta-eliminada", "/admin/usuarios")).toEqual({ tone: "removal", message: "Se eliminó la cuenta" });
    expect(urlToast("idioma-guardado", "/cuenta")).toEqual({ tone: "success", message: "Idioma guardado" });
    expect(Object.keys(URL_TOASTS)).toEqual(["guardado", "cuenta-eliminada", "idioma-guardado"]);
  });

  it.each([
    ["cuenta-eliminada", "/dashboard"],
    ["cuenta-eliminada", "/egresos"],
    ["cuenta-eliminada", "/admin/usuarios/123"],
    ["guardado", "/dashboard"],
    ["guardado", "/admin/usuarios"],
    ["idioma-guardado", "/dashboard"],
    ["idioma-guardado", "/cuenta/otra"],
  ])("en otra página no muestra nada (un enlace no puede inventar un aviso): %s en %s", (code, pathname) => {
    expect(urlToast(code, pathname)).toBeNull();
  });

  it.each([["otro"], ["toString"], ["__proto__"], [""], [null], [undefined], [["guardado"]]])(
    "ignora lo que no es un código conocido: %j",
    (code) => {
      expect(urlToast(code, "/egresos")).toBeNull();
    },
  );
});

describe("withoutParams", () => {
  it("quita esos parámetros y deja los demás", () => {
    expect(withoutParams("/egresos", "mes=2026-09&aviso=guardado", ["aviso"])).toBe("/egresos?mes=2026-09");
    expect(withoutParams("/egresos", "aviso=guardado", ["aviso"])).toBe("/egresos");
    expect(withoutParams("/admin/usuarios", "q=ana&aviso=x&panel=1", ["aviso", "panel"])).toBe("/admin/usuarios?q=ana");
    expect(withoutParams("/dashboard", "", ["aviso"])).toBe("/dashboard");
  });
});

describe("urlToast · en inglés", () => {
  it("el mismo aviso, con su texto en inglés", () => {
    expect(urlToast("guardado", "/egresos", "en")).toEqual({ tone: "success", message: "Changes saved" });
    expect(urlToast("cuenta-eliminada", "/admin/usuarios", "en")).toEqual({ tone: "removal", message: "The account was deleted" });
    expect(urlToast("idioma-guardado", "/cuenta", "en")).toEqual({ tone: "success", message: "Language saved" });
    expect(urlToast("guardado", "/egresos")).toEqual({ tone: "success", message: "Cambios guardados" });
  });
});
