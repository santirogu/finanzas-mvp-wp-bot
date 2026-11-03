import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { appNotice } from "@/db/schema";
import { getCurrentNotice } from "./current-notice";

// El aviso para todos que se ve (la franja de la app, el login y el registro), con la base de verdad.

const now = new Date("2026-10-23T15:00:00Z");
const publishedAt = new Date("2026-10-22T12:00:00Z");
const publish = (values: Partial<typeof appNotice.$inferInsert> = {}) =>
  db.insert(appNotice).values({ id: 1, message: "Mantenimiento el sábado de 8 a 9", tone: "important", endsAt: new Date("2026-10-25T13:00:00Z"), publishedAt, ...values });

describe("getCurrentNotice", () => {
  it("sin aviso, nada", async () => {
    expect(await getCurrentNotice("es", now)).toBeNull();
  });

  it("el vigente, con su versión", async () => {
    await publish();
    expect(await getCurrentNotice("es", now)).toEqual({ message: "Mantenimiento el sábado de 8 a 9", tone: "important", version: String(publishedAt.getTime()) });
  });

  it("en inglés, el texto en inglés; sin él, el de español", async () => {
    await publish({ messageEn: "Maintenance on Saturday from 8 to 9" });
    expect(await getCurrentNotice("en", now)).toMatchObject({ message: "Maintenance on Saturday from 8 to 9" });
    expect(await getCurrentNotice("es", now)).toMatchObject({ message: "Mantenimiento el sábado de 8 a 9" });
    await db.update(appNotice).set({ messageEn: null });
    expect(await getCurrentNotice("en", now)).toMatchObject({ message: "Mantenimiento el sábado de 8 a 9" });
  });

  it("vencido (justo a la hora de fin, también), nada", async () => {
    await publish({ endsAt: now });
    expect(await getCurrentNotice("es", now)).toBeNull();
    expect(await getCurrentNotice("es", new Date(now.getTime() - 1))).not.toBeNull();
  });

  it("la base no acepta otro tipo ni una segunda fila", async () => {
    await expect(publish({ tone: "danger" })).rejects.toThrow();
    await publish();
    await expect(publish({ id: 2 })).rejects.toThrow();
  });
});
