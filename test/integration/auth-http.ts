// Pedidos HTTP a Better Auth como los haría un navegador (o alguien con curl), para las pruebas de
// integración de roles y verificación en dos pasos.
import { expect } from "vitest";
import { auth } from "@/lib/auth";
import { findAccountRole, setRole } from "@/modules/account/terminal";
import { secretFromUri, totp } from "../totp";

export const PASSWORD = "clave-segura-123";
const ORIGIN = new URL(auth.options.baseURL!).origin;

// Una IP distinta por pedido: el límite de intentos por IP se prueba aparte.
let ipCounter = 0;
export function nextIp() {
  ipCounter++;
  return `10.20.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

/** Las cookies de un navegador: guarda lo que manda el servidor y lo devuelve en cada pedido. */
export class Jar {
  private cookies = new Map<string, string>();
  update(response: Response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attributes] = raw.split(";");
      const [name, ...value] = pair.split("=");
      const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value.join("=") === "";
      if (expired) this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value.join("="));
    }
    return response;
  }
  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
  has(fragment: string) {
    return [...this.cookies.keys()].some((name) => name.includes(fragment));
  }
}

export async function post(path: string, body: unknown, jar?: Jar, ip = nextIp()) {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": ip,
        ...(jar ? { cookie: jar.header() } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  jar?.update(response);
  return response;
}

export const json = async (response: Response) => response.json() as Promise<Record<string, unknown>>;
export const sessionOf = (jar: Jar) => auth.api.getSession({ headers: new Headers({ cookie: jar.header() }) });

export async function register(email: string, name = "Ana") {
  const jar = new Jar();
  expect((await post("/sign-up/email", { name, email, password: PASSWORD }, jar)).status).toBe(200);
  return jar;
}

export async function makeAdmin(email: string) {
  const account = await findAccountRole(email);
  await setRole(account!.id, "admin");
  return account!;
}

/** Activa la verificación en dos pasos en esa sesión; devuelve la clave y los códigos de respaldo. */
export async function enableTwoFactor(jar: Jar) {
  const enabled = await json(await post("/two-factor/enable", { password: PASSWORD }, jar));
  const secret = secretFromUri(enabled.totpURI as string);
  expect((await post("/two-factor/verify-totp", { code: totp(secret) }, jar)).status).toBe(200);
  return { secret, backupCodes: enabled.backupCodes as string[], totpURI: enabled.totpURI as string };
}

/** Un admin con la verificación activa: su navegador, la clave y los códigos de respaldo. */
export async function adminWithTwoFactor(email = "ana@test.local") {
  const jar = await register(email);
  await makeAdmin(email);
  return { jar, ...(await enableTwoFactor(jar)) };
}

/** Primer paso del login: correo y contraseña. */
export async function signIn(email: string, password = PASSWORD) {
  const jar = new Jar();
  const response = await post("/sign-in/email", { email, password }, jar);
  return { jar, response, body: await json(response) };
}
