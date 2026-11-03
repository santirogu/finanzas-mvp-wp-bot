import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, DATA_CONTROLLER } from "./contact";

describe("el responsable del tratamiento (Decreto 1377 de 2013, art. 13)", () => {
  it("tiene nombre, domicilio, dirección, teléfono y correo, sin datos por llenar", () => {
    for (const [field, value] of Object.entries(DATA_CONTROLLER)) {
      expect(value.trim(), field).not.toBe("");
      expect(value, field).not.toMatch(/PENDIENTE/i);
    }
    expect(DATA_CONTROLLER.email).toBe(CONTACT_EMAIL);
  });
});
