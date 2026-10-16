import { describe, expect, it } from "vitest";
import { isCronRequest } from "./cron-auth";

describe("isCronRequest", () => {
  it("acepta el secreto exacto con el prefijo Bearer", () => {
    expect(isCronRequest("Bearer secreto-del-cron", "secreto-del-cron")).toBe(true);
  });

  it.each([
    ["sin cabecera", null],
    ["vacía", ""],
    ["sin Bearer", "secreto-del-cron"],
    ["otro esquema", "Basic secreto-del-cron"],
    ["otro secreto del mismo largo", "Bearer secreto-del-croN"],
    ["más corto", "Bearer secreto-del-cro"],
    ["más largo", "Bearer secreto-del-cron2"],
    ["en minúsculas", "bearer secreto-del-cron"],
  ])("rechaza %s", (_, header) => {
    expect(isCronRequest(header, "secreto-del-cron")).toBe(false);
  });

  it("sin secreto configurado rechaza todo, incluso 'Bearer ' o 'Bearer undefined'", () => {
    for (const header of ["Bearer ", "Bearer undefined", "Bearer"]) {
      expect(isCronRequest(header, undefined)).toBe(false);
      expect(isCronRequest(header, "")).toBe(false);
    }
  });
});
