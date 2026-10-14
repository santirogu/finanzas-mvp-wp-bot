// Se ejecuta antes de cada archivo de pruebas de componentes: agrega los matchers de jest-dom
// (toBeVisible, toHaveValue, …) y desmonta lo renderizado entre pruebas.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
