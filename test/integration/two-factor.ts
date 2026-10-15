// Un admin con la verificación en dos pasos lista, para las pruebas de integración: la clave se
// guarda cifrada como lo hace Better Auth y los códigos se calculan como Google Authenticator.
import { randomUUID } from "node:crypto";
import { symmetricEncrypt } from "better-auth/crypto";
import { db } from "@/db";
import { twoFactor } from "@/db/schema";
import { auth } from "@/lib/auth";
import { base32Encode, totp } from "../totp";
import { createUser } from "./factories";

export async function createAdminWithTwoFactor(overrides: Parameters<typeof createUser>[0] = {}) {
  const secret = `clave-${randomUUID()}`;
  const admin = await createUser({ name: "Ana Admin", role: "admin", twoFactorEnabled: true, ...overrides });
  const { secretConfig } = await auth.$context;
  await db.insert(twoFactor).values({
    id: randomUUID(),
    userId: admin.id,
    secret: await symmetricEncrypt({ key: secretConfig, data: secret }),
    backupCodes: await symmetricEncrypt({ key: secretConfig, data: "[]" }),
  });
  /** El código de Google Authenticator del admin en ese momento. */
  const codeAt = (now: Date) => totp(base32Encode(secret), now.getTime());
  return { admin, secret, codeAt };
}
