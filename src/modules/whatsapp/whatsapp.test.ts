import { describe, expect, it } from "vitest";
import { extractMessages } from "./payload";
import { formatPhone, maskPhone } from "./phone";
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

  it("quita el carácter nulo del texto (Postgres no lo acepta y el mensaje se perdería)", () => {
    const payload = webhook([{ id: "wamid.N", from: "573001112233", timestamp: "1791950000", type: "text", text: { body: "gasté \u000020 mil\u0000" } }]);
    expect(extractMessages(payload)[0].text).toBe("gasté 20 mil");
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

  it("no procesa los mensajes de otro tipo de objeto, aunque vengan bien formados", () => {
    const message = { id: "wamid.X", from: "573001112233", type: "text", text: { body: "gasté 20 mil" } };
    expect(extractMessages({ ...webhook([message]), object: "page" })).toEqual([]);
    expect(extractMessages({ ...webhook([message]), object: undefined })).toEqual([]);
    // Y si "entry" no es una lista, tampoco (sin fallar).
    expect(extractMessages({ object: "whatsapp_business_account", entry: {} })).toEqual([]);
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

describe("extractMessages · robustez", () => {
  const wrap = (value: unknown, extra: unknown[] = []) => ({
    object: "whatsapp_business_account",
    entry: [...extra, { changes: [{ field: "messages", value }] }],
  });

  it("tolera entradas y cambios nulos", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        null,
        { changes: [null, { field: "messages", value: { messages: [{ id: "w", from: "57" }] } }] },
      ],
    };
    expect(extractMessages(payload)).toHaveLength(1);
  });

  it("solo toma el texto de los mensajes de tipo texto", () => {
    const [image, emptyText] = extractMessages(
      wrap({
        messages: [
          { id: "w1", from: "57", type: "image", text: { body: "no debería leerse" } },
          { id: "w2", from: "57", type: "text" },
        ],
      }),
    );
    expect(image.text).toBeNull();
    expect(emptyText.text).toBeNull();
  });

  it("busca el contacto del remitente y tolera contactos sin perfil", () => {
    const [fromSecond, withoutProfile] = extractMessages(
      wrap({
        messages: [
          { id: "w1", from: "57002", type: "text", text: { body: "hola" } },
          { id: "w2", from: "57003", type: "text", text: { body: "hola" } },
        ],
        contacts: [
          { wa_id: "57001", profile: { name: "Otro" } },
          { wa_id: "57002", profile: { name: "Ana" } },
          { wa_id: "57003" },
        ],
      }),
    );
    expect(fromSecond.profileName).toBe("Ana");
    expect(withoutProfile.profileName).toBeNull();
  });

  it("sin timestamp usa la hora actual en segundos", () => {
    const before = Math.floor(Date.now() / 1000);
    const [message] = extractMessages(wrap({ messages: [{ id: "w", from: "57" }] }));
    expect(message.timestamp).toBeGreaterThanOrEqual(before);
    expect(message.timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });
});

describe("maskPhone · formatos", () => {
  it("acepta el número con símbolos y espacios", () => {
    expect(maskPhone("+57 300 123 4567")).toBe("+57 300 ••• 4567");
  });

  it("solo usa el formato colombiano si empieza por 57 y tiene 12 dígitos", () => {
    expect(maskPhone("445551234567")).toBe("+••••••••4567");
    expect(maskPhone("5730012345")).toBe("+••••••2345");
  });
});

describe("isValidSignature · prefijo", () => {
  it("exige el prefijo sha256= exacto", () => {
    const body = "{}";
    const hex = signBody(body, "secreto").slice("sha256=".length);
    expect(isValidSignature(body, `sha512=${hex}`, "secreto")).toBe(false);
    expect(isValidSignature(body, `sha256=${hex}`, "secreto")).toBe(true);
  });
});

describe("formatPhone", () => {
  it.each([
    ["573001112233", "+57 300 111 2233"],
    ["+57 300 111 2233", "+57 300 111 2233"],
    // Otro país o un largo distinto: los dígitos tal cual, con "+".
    ["14155550123", "+14155550123"],
    ["5730011122", "+5730011122"],
  ])("%j → %j", (phone, expected) => {
    expect(formatPhone(phone)).toBe(expected);
  });
});
