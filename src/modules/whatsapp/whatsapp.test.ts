import { describe, expect, it } from "vitest";
import { extractMessages } from "./payload";
import { maskPhone } from "./phone";
import { isValidSignature, signBody } from "./signature";

describe("isValidSignature", () => {
  const body = JSON.stringify({ hola: "mundo" });
  const secret = "app-secret-de-prueba";

  it("acepta la firma correcta", () => {
    expect(isValidSignature(body, signBody(body, secret), secret)).toBe(true);
  });

  it.each([
    ["sin cabecera", null],
    ["sin prefijo", signBody(body, secret).replace("sha256=", "")],
    ["firma de otro secreto", signBody(body, "otro")],
    ["hex inválido", "sha256=zzzz"],
  ])("rechaza %s", (_, header) => {
    expect(isValidSignature(body, header, secret)).toBe(false);
  });

  it("rechaza si el cuerpo fue alterado", () => {
    expect(isValidSignature(body + " ", signBody(body, secret), secret)).toBe(false);
  });

  it("rechaza todo si no hay App Secret configurado", () => {
    expect(isValidSignature(body, signBody(body, ""), "")).toBe(false);
  });
});

const webhook = (messages: unknown[], contacts: unknown[] = []) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "1",
      changes: [
        { field: "messages", value: { messaging_product: "whatsapp", contacts, messages } },
      ],
    },
  ],
});

describe("extractMessages", () => {
  it("extrae mensajes de texto con el nombre del contacto", () => {
    const payload = webhook(
      [
        {
          id: "wamid.A",
          from: "573001112233",
          timestamp: "1791950000",
          type: "text",
          text: { body: "balance" },
        },
      ],
      [{ wa_id: "573001112233", profile: { name: "Santiago" } }],
    );
    expect(extractMessages(payload)).toEqual([
      {
        id: "wamid.A",
        from: "573001112233",
        type: "text",
        text: "balance",
        timestamp: 1791950000,
        profileName: "Santiago",
      },
    ]);
  });

  it("marca como texto null los audios, imágenes, etc.", () => {
    const payload = webhook([
      { id: "wamid.B", from: "573001112233", timestamp: "1", type: "audio", audio: {} },
    ]);
    expect(extractMessages(payload)[0]).toMatchObject({ type: "audio", text: null });
  });

  it("ignora notificaciones de estado y payloads ajenos", () => {
    const statuses = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            { field: "messages", value: { statuses: [{ id: "wamid.C", status: "read" }] } },
          ],
        },
      ],
    };
    expect(extractMessages(statuses)).toEqual([]);
    expect(extractMessages({ object: "page", entry: [] })).toEqual([]);
    expect(extractMessages(null)).toEqual([]);
    expect(extractMessages("texto")).toEqual([]);
  });
});

describe("extractMessages · payloads incompletos", () => {
  it("tolera entradas sin cambios, campos ajenos y mensajes sin id o remitente", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {},
        { changes: [{ field: "account_update", value: {} }] },
        { changes: [{ field: "messages" }] },
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  { from: "573001112233", type: "text", text: { body: "sin id" } },
                  { id: "wamid.SIN_FROM", type: "text", text: { body: "sin remitente" } },
                  { id: "wamid.OK", from: "573001112233" },
                ],
                contacts: [{ wa_id: "573001112233", profile: {} }],
              },
            },
          ],
        },
      ],
    };

    const before = Math.floor(Date.now() / 1000);
    const [message, ...rest] = extractMessages(payload);

    expect(rest).toEqual([]);
    expect(message).toMatchObject({
      id: "wamid.OK",
      type: "unknown",
      text: null,
      profileName: null,
    });
    expect(message.timestamp).toBeGreaterThanOrEqual(before);
  });
});

describe("maskPhone", () => {
  it("oculta el número colombiano", () => {
    expect(maskPhone("573001234567")).toBe("+57 300 ••• 4567");
  });
  it("oculta otros formatos", () => {
    expect(maskPhone("15551234567")).toBe("+•••••••4567");
  });
});
