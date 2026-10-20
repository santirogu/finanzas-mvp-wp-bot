import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Los formularios con campos validados por el navegador (obligatorio, correo, largo mínimo, formato,
// fecha máxima) usan useFieldErrors: así sus errores salen en español, debajo de cada campo, y no en
// el globo del navegador (que sale en su idioma). Si agregas un formulario, esta prueba te lo pide.

const ROOT = resolve(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const sources = walk(join(ROOT, "src")).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));
const hasForm = (code: string) => /<form\b|<Form\b/.test(code);
// maxLength no cuenta: el navegador no deja escribir de más, así que nunca muestra ese globo.
const validates = (code: string) => /\brequired\b|\bminLength=|\bpattern=|type="email"|\bmax=|\bmin=/.test(code);

describe("formularios", () => {
  const validated = sources.filter((file) => {
    const code = readFileSync(file, "utf8");
    return hasForm(code) && validates(code);
  });

  it("la regla encuentra los formularios de la app", () => {
    const names = validated.map((f) => relative(ROOT, f));
    expect(names).toEqual(
      expect.arrayContaining([
        "src/app/[lang]/(auth)/auth-form.tsx",
        "src/app/[lang]/(auth)/two-factor-login.tsx",
        "src/components/transaction-form.tsx",
        "src/app/[lang]/(app)/cuenta/delete-account-form.tsx",
      ]),
    );
  });

  it.each(validated.map((f) => [relative(ROOT, f), f]))("%s muestra sus errores en español (useFieldErrors)", (_, file) => {
    const code = readFileSync(file, "utf8");
    expect(code).toMatch(/useFieldErrors\(/);
    expect(code).toMatch(/\{\.\.\.formProps\}/);
  });
});

// Los errores y las alertas van en rojo (--danger), como los errores de cada campo (FieldError): el
// naranja (--expense) significa "egreso", y un mismo formulario no puede mostrar el error en dos colores.
describe("errores", () => {
  const alerts = sources.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/<[a-zA-Z]+\b[^>]*\brole="alert"[^>]*>/g)].map((m) => [relative(ROOT, file), m[0]]),
  );

  it("la regla encuentra los avisos de error de la app", () => {
    expect(alerts.length).toBeGreaterThan(5);
  });

  it.each(alerts)("%s: el aviso de error usa el rojo, no el color de los egresos", (_, tag) => {
    expect(tag).not.toMatch(/expense/);
  });
});
