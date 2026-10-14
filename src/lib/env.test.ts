import { afterEach, describe, expect, it } from "vitest";
import { envVar } from "./env";

describe("envVar", () => {
  afterEach(() => {
    delete process.env.TEST_SECRET;
  });

  it("quita el salto de línea que queda al pegar en Vercel", () => {
    process.env.TEST_SECRET = "abc123\n";
    expect(envVar("TEST_SECRET")).toBe("abc123");
  });

  it("devuelve undefined si está vacía o solo tiene espacios", () => {
    process.env.TEST_SECRET = "  \n";
    expect(envVar("TEST_SECRET")).toBeUndefined();
    expect(envVar("NO_EXISTE")).toBeUndefined();
  });
});
