// Se ejecuta antes de cada archivo de pruebas de componentes: agrega los matchers de jest-dom
// (toBeVisible, toHaveValue, …) y desmonta lo renderizado entre pruebas.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// Los componentes de servidor leen el idioma del segmento [lang] (next/root-params), que solo existe al
// compilar con Next: en las pruebas, español (src/i18n/server.test.ts prueba la lectura).
vi.mock("next/root-params", () => ({ lang: async () => "es" }));
