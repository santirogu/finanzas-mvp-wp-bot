import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "./auth";

// El formulario de registro lo envía el navegador: nadie debe poder elegir al registrarse campos
// que controla el servidor (moneda, zona horaria, correo verificado).
describe("registro (Better Auth)", () => {
  it("ignora la moneda, la zona horaria y la verificación del correo que mande el cliente", async () => {
    await auth.api.signUpEmail({
      body: {
        name: "Ana",
        email: "ana@test.local",
        password: "clave-segura-123",
        currency: "USD",
        timezone: "Asia/Tokyo",
        emailVerified: true,
      } as never,
    });

    const [row] = await db.select().from(user).where(eq(user.email, "ana@test.local"));
    expect(row).toMatchObject({
      name: "Ana",
      currency: "COP",
      timezone: "America/Bogota",
      emailVerified: false,
    });
  });

  it("no permite iniciar sesión con la contraseña equivocada", async () => {
    await auth.api.signUpEmail({
      body: { name: "Beto", email: "beto@test.local", password: "clave-segura-123" },
    });

    await expect(
      auth.api.signInEmail({ body: { email: "beto@test.local", password: "otra-clave-123" } }),
    ).rejects.toThrow();
  });
});
