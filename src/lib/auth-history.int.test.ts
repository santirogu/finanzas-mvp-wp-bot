import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, user } from "@/db/schema";

// Si guardar el evento de registro falla, la cuenta se crea igual (y el error queda en el log):
// perder una línea del historial es mejor que impedir registrarse.
vi.mock("@/modules/account/events", () => ({
  recordEvent: vi.fn(async () => {
    throw new Error("se cayó la tabla del historial");
  }),
}));

const { auth } = await import("./auth");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("historial al registrarse", () => {
  it("un error al guardar el evento no impide crear la cuenta", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await auth.api.signUpEmail({
      body: { name: "Ana", email: "ana@test.local", password: "clave-segura-123" },
    });

    expect(result.user.email).toBe("ana@test.local");
    expect(await db.select().from(user).where(eq(user.email, "ana@test.local"))).toHaveLength(1);
    expect(await db.select().from(accountEvent)).toEqual([]);
    // Solo el tipo del error: su mensaje podría traer datos de la consulta.
    expect(logged).toHaveBeenCalledWith("[historial] no se pudo registrar el evento de registro", result.user.id, "Error");
  });
});
