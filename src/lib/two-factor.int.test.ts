import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { loginFailure, session, twoFactor, user } from "@/db/schema";
import { findAccountRole, resetTwoFactor } from "@/modules/account/admin";
import { TWO_FACTOR_DISABLED_PATHS, TWO_FACTOR_LOCKOUT } from "@/modules/auth/two-factor-rules";
import {
  Jar,
  PASSWORD,
  adminWithTwoFactor,
  json,
  makeAdmin,
  post,
  register,
  sessionOf,
  signIn,
} from "../../test/integration/auth-http";
import { secretFromUri, totp } from "../../test/totp";

// Verificación en dos pasos con Better Auth y la base de verdad, por HTTP (como un navegador o
// alguien con curl). Los códigos se calculan como Google Authenticator (test/totp.ts).

const userRow = async (email: string) => (await db.select().from(user).where(eq(user.email, email)))[0];

describe("activar la verificación (solo admins)", () => {
  it("un usuario normal no puede activarla", async () => {
    const jar = await register("beto@test.local");
    const response = await post("/two-factor/enable", { password: PASSWORD }, jar);

    expect(response.status).toBe(403);
    expect(await json(response)).toMatchObject({ code: "ADMIN_ONLY" });
    expect(await db.select().from(twoFactor)).toEqual([]);
    expect((await userRow("beto@test.local")).twoFactorEnabled).toBe(false);
  });

  it("sin sesión no se puede activar", async () => {
    const response = await post("/two-factor/enable", { password: PASSWORD });
    expect(response.status).toBe(401);
  });

  it("con la contraseña equivocada no se activa y cuenta como intento fallido", async () => {
    const jar = await register("ana@test.local");
    await makeAdmin("ana@test.local");

    const response = await post("/two-factor/enable", { password: "otra-clave-123" }, jar);

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ code: "INVALID_PASSWORD" });
    expect(await db.select().from(twoFactor)).toEqual([]);
    expect(await db.select().from(loginFailure).where(eq(loginFailure.email, "ana@test.local"))).toEqual([
      expect.objectContaining({ failures: 1 }),
    ]);
  });

  it("tras 5 contraseñas equivocadas queda bloqueada, aunque después llegue la correcta", async () => {
    const jar = await register("ana@test.local");
    await makeAdmin("ana@test.local");
    for (let i = 0; i < 5; i++) await post("/two-factor/enable", { password: "otra-clave-123" }, jar);

    const response = await post("/two-factor/enable", { password: PASSWORD }, jar);

    expect(response.status).toBe(429);
    expect(await json(response)).toMatchObject({ code: "ACCOUNT_LOCKED" });
    expect(await db.select().from(twoFactor)).toEqual([]);
  });

  it("queda a medias hasta confirmar el primer código; un código equivocado no la activa", async () => {
    const jar = await register("ana@test.local");
    await makeAdmin("ana@test.local");
    const enabled = await json(await post("/two-factor/enable", { password: PASSWORD }, jar));

    expect(enabled.totpURI).toMatch(/^otpauth:\/\/totp\/Finanzas%20MVP:ana%40test\.local\?/);
    expect(new URL(enabled.totpURI as string).searchParams.get("issuer")).toBe("Finanzas MVP");
    expect(enabled.backupCodes).toHaveLength(10);
    expect((await userRow("ana@test.local")).twoFactorEnabled).toBe(false);
    expect(await db.select({ verified: twoFactor.verified }).from(twoFactor)).toEqual([{ verified: false }]);

    const secret = secretFromUri(enabled.totpURI as string);
    const wrong = String((Number(totp(secret)) + 1) % 1_000_000).padStart(6, "0");
    const response = await post("/two-factor/verify-totp", { code: wrong }, jar);
    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ code: "INVALID_CODE" });
    expect((await userRow("ana@test.local")).twoFactorEnabled).toBe(false);

    expect((await post("/two-factor/verify-totp", { code: totp(secret) }, jar)).status).toBe(200);
    expect((await userRow("ana@test.local")).twoFactorEnabled).toBe(true);
    expect((await sessionOf(jar))?.user).toMatchObject({ email: "ana@test.local", twoFactorEnabled: true });
  });

  it("la clave y los códigos de respaldo se guardan cifrados", async () => {
    const { secret, backupCodes } = await adminWithTwoFactor();
    const [row] = await db.select().from(twoFactor);
    expect(row.secret).not.toContain(secret);
    for (const code of backupCodes) expect(row.backupCodes).not.toContain(code);
  });

  it("ya activa, no se puede volver a activar para cambiar la clave", async () => {
    const { jar } = await adminWithTwoFactor();
    const response = await post("/two-factor/enable", { password: PASSWORD }, jar);
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ code: "TOTP_ALREADY_ENABLED" });
  });
});

describe("iniciar sesión con la verificación activa", () => {
  it("la contraseña sola no da sesión: pide el código", async () => {
    await adminWithTwoFactor();

    const { jar, response, body } = await signIn("ana@test.local");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ twoFactorRedirect: true, twoFactorMethods: ["totp"] });
    expect(jar.has("session_token")).toBe(false);
    expect(await sessionOf(jar)).toBeNull();
  });

  it("con el código correcto entra", async () => {
    const { secret } = await adminWithTwoFactor();
    const { jar } = await signIn("ana@test.local");

    const response = await post("/two-factor/verify-totp", { code: totp(secret) }, jar);

    expect(response.status).toBe(200);
    expect((await sessionOf(jar))?.user).toMatchObject({ email: "ana@test.local", role: "admin" });
  });

  it("con un código equivocado no entra", async () => {
    const { secret } = await adminWithTwoFactor();
    const { jar } = await signIn("ana@test.local");
    const wrong = String((Number(totp(secret)) + 500_000) % 1_000_000).padStart(6, "0");

    const response = await post("/two-factor/verify-totp", { code: wrong }, jar);

    expect(response.status).toBe(401);
    expect(await sessionOf(jar)).toBeNull();
  });

  it("sin haber pasado por la contraseña, el código solo no sirve", async () => {
    const { secret } = await adminWithTwoFactor();
    const response = await post("/two-factor/verify-totp", { code: totp(secret) }, new Jar());
    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ code: "INVALID_TWO_FACTOR_COOKIE" });
  });

  it("con la contraseña equivocada no llega ni al segundo paso", async () => {
    await adminWithTwoFactor();
    const { jar, response } = await signIn("ana@test.local", "otra-clave-123");
    expect(response.status).toBe(401);
    expect(jar.has("two_factor")).toBe(false);
  });

  it(`tras ${TWO_FACTOR_LOCKOUT.maxFailedAttempts} códigos equivocados se bloquea, aunque llegue el correcto o se vuelva a empezar`, async () => {
    const { secret } = await adminWithTwoFactor();
    const wrong = String((Number(totp(secret)) + 500_000) % 1_000_000).padStart(6, "0");
    for (let i = 0; i < TWO_FACTOR_LOCKOUT.maxFailedAttempts; i++) {
      const { jar } = await signIn("ana@test.local");
      expect((await post("/two-factor/verify-totp", { code: wrong }, jar)).status).toBe(401);
    }

    const { jar } = await signIn("ana@test.local");
    const response = await post("/two-factor/verify-totp", { code: totp(secret) }, jar);

    expect(response.status).toBe(429);
    expect(await json(response)).toMatchObject({ code: "ACCOUNT_TEMPORARILY_LOCKED" });
    expect(await sessionOf(jar)).toBeNull();
  });

  it("un código de respaldo sirve una sola vez", async () => {
    const { backupCodes } = await adminWithTwoFactor();

    const first = await signIn("ana@test.local");
    expect((await post("/two-factor/verify-backup-code", { code: backupCodes[0] }, first.jar)).status).toBe(200);
    expect((await sessionOf(first.jar))?.user.email).toBe("ana@test.local");

    const second = await signIn("ana@test.local");
    const reused = await post("/two-factor/verify-backup-code", { code: backupCodes[0] }, second.jar);
    expect(reused.status).toBe(401);
    expect(await sessionOf(second.jar)).toBeNull();

    // Los demás siguen sirviendo.
    const third = await signIn("ana@test.local");
    expect((await post("/two-factor/verify-backup-code", { code: backupCodes[1] }, third.jar)).status).toBe(200);
  });

  it.each(["/two-factor/verify-totp", "/two-factor/verify-backup-code"])(
    "%s no acepta 'recordar este dispositivo'",
    async (path) => {
      const { secret, backupCodes } = await adminWithTwoFactor();
      const { jar } = await signIn("ana@test.local");
      const code = path.endsWith("totp") ? totp(secret) : backupCodes[0];

      const response = await post(path, { code, trustDevice: true }, jar);

      expect(response.status).toBe(400);
      expect(await json(response)).toMatchObject({ code: "TRUST_DEVICE_NOT_ALLOWED" });
      expect(await sessionOf(jar)).toBeNull();
      expect(jar.has("trust_device")).toBe(false);
    },
  );
});

describe("lo que no se puede hacer desde la app", () => {
  it.each([...TWO_FACTOR_DISABLED_PATHS])("%s no existe (404), ni para un admin con sesión", async (path) => {
    const { jar } = await adminWithTwoFactor();
    const response = await post(path, { password: PASSWORD, code: "123456" }, jar);
    expect(response.status).toBe(404);
    expect((await userRow("ana@test.local")).twoFactorEnabled).toBe(true);
  });

  it("el estado de la verificación no se cambia con 'actualizar perfil'", async () => {
    const { jar } = await adminWithTwoFactor();
    const response = await post("/update-user", { twoFactorEnabled: false }, jar);
    expect(response.status).toBe(400);
    expect((await userRow("ana@test.local")).twoFactorEnabled).toBe(true);

    const beto = await register("beto@test.local");
    await post("/update-user", { twoFactorEnabled: true }, beto);
    expect((await userRow("beto@test.local")).twoFactorEnabled).toBe(false);
  });
});

describe("reiniciarla desde la terminal (pnpm admin:reset-2fa)", () => {
  it("borra la clave, la desactiva y cierra todas las sesiones; luego se entra solo con la contraseña", async () => {
    const { jar, secret } = await adminWithTwoFactor();
    const account = await findAccountRole("ana@test.local");

    expect(await resetTwoFactor(account!.id)).toEqual({ sessionsClosed: 1 });

    expect(await db.select().from(twoFactor)).toEqual([]);
    expect((await userRow("ana@test.local")).twoFactorEnabled).toBe(false);
    expect(await sessionOf(jar)).toBeNull();
    // La clave vieja ya no sirve para nada, y el login vuelve a ser de un paso.
    const { jar: again, body } = await signIn("ana@test.local");
    expect(body.twoFactorRedirect).toBeUndefined();
    expect((await sessionOf(again))?.user.twoFactorEnabled).toBe(false);
    expect((await post("/two-factor/verify-totp", { code: totp(secret) }, again)).status).not.toBe(200);
  });

  it("no toca a otras cuentas y devuelve null si la cuenta no existe", async () => {
    await adminWithTwoFactor("ana@test.local");
    const beto = await adminWithTwoFactor("beto@test.local");
    const ana = await findAccountRole("ana@test.local");

    await resetTwoFactor(ana!.id);

    expect((await userRow("beto@test.local")).twoFactorEnabled).toBe(true);
    expect(await sessionOf(beto.jar)).not.toBeNull();
    expect(await resetTwoFactor("no-existe")).toBeNull();
  });
});

describe("borrar la cuenta", () => {
  it("borra también la clave y los códigos de respaldo", async () => {
    await adminWithTwoFactor();
    const account = await findAccountRole("ana@test.local");
    await db.delete(user).where(eq(user.id, account!.id));
    expect(await db.select().from(twoFactor)).toEqual([]);
    expect(await db.select().from(session)).toEqual([]);
  });
});
