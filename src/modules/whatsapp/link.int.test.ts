import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { user as userTable, whatsappLink, whatsappLinkCode } from "@/db/schema";
import { createUser } from "../../../test/integration/factories";
import {
  consumeLinkCode,
  createLinkCode,
  getLinkForUser,
  getUserByPhone,
  unlinkUser,
} from "./link";

describe("vinculación de WhatsApp", () => {
  it("el código tiene 6 dígitos, vence en ~10 minutos y se guarda solo su hash", async () => {
    const user = await createUser();

    const { code, expiresAt } = await createLinkCode(user.id);

    expect(code).toMatch(/^\d{6}$/);
    const minutes = (expiresAt.getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThanOrEqual(10);
    const [stored] = await db.select().from(whatsappLinkCode);
    expect(stored.codeHash).not.toBe(code);
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("consumir el código crea el vínculo y permite encontrar al usuario por teléfono", async () => {
    const user = await createUser({ name: "Ana", timezone: "America/Bogota", currency: "COP" });
    const { code } = await createLinkCode(user.id);

    expect(await consumeLinkCode("573001112233", code)).toEqual({
      ok: true,
      userId: user.id,
      name: "Ana",
    });
    expect(await getLinkForUser(user.id)).toMatchObject({ phone: "573001112233" });
    expect(await getUserByPhone("573001112233")).toEqual({
      id: user.id,
      name: "Ana",
      timezone: "America/Bogota",
      currency: "COP",
    });
    expect(await getUserByPhone("573000000000")).toBeNull();
  });

  it("vincular un número nuevo reemplaza el anterior de la misma cuenta", async () => {
    const user = await createUser();
    await consumeLinkCode("573001111111", (await createLinkCode(user.id)).code);
    await consumeLinkCode("573002222222", (await createLinkCode(user.id)).code);

    const links = await db.select().from(whatsappLink);
    expect(links).toEqual([expect.objectContaining({ userId: user.id, phone: "573002222222" })]);
  });

  it("desvincular elimina el número y cualquier código pendiente", async () => {
    const user = await createUser();
    await consumeLinkCode("573001112233", (await createLinkCode(user.id)).code);
    await createLinkCode(user.id);

    await unlinkUser(user.id);

    expect(await getLinkForUser(user.id)).toBeNull();
    expect(await getUserByPhone("573001112233")).toBeNull();
    expect(await db.select().from(whatsappLinkCode)).toEqual([]);
  });

  it("borrar la cuenta borra también su vínculo", async () => {
    const user = await createUser();
    await consumeLinkCode("573001112233", (await createLinkCode(user.id)).code);

    await db.delete(userTable).where(eq(userTable.id, user.id));

    expect(await getUserByPhone("573001112233")).toBeNull();
  });
});
