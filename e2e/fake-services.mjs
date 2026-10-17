#!/usr/bin/env node
// Servidores falsos de WhatsApp (Graph API) y de Claude para las pruebas E2E del bot. La app los
// usa en vez de los reales (WHATSAPP_API_URL y ANTHROPIC_BASE_URL apuntan aquí): nada sale a
// internet ni gasta créditos. Lo levanta Playwright (webServer en playwright.config.ts).
//
//   POST /graph/<versión>/<teléfono>/messages  → guarda el mensaje que "envió" el bot
//   GET  /mensajes?to=<número>                 → los mensajes que recibió ese número
//   POST /anthropic/v1/messages                → respuesta fija según el texto del usuario
//   GET  /claude                               → los textos que la app le pidió interpretar
//   GET  /graph/<versión>/<teléfono>           → el número del bot (Probar conexiones en /admin/bot)
//   GET  /anthropic/v1/models/<modelo>         → el modelo del bot (Probar conexiones)
//   POST /fallar?servicio=whatsapp|claude      → la próxima consulta de ese servicio responde 401
//   GET  /salud                                → para saber que ya arrancó

import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_SERVICES_PORT ?? 3101);
const sent = [];
const claudeRequests = [];
// Las consultas de Probar conexiones que deben fallar una vez (solo las usa esa prueba).
const failNext = new Set();

// Lo que "entiende" el Claude falso: frases fijas de las pruebas.
const INTERPRETATIONS = [
  {
    match: /zapatos/i,
    transactions: [{ type: "expense", amount: 500000, description: "Zapatos", category: "Ropa" }],
  },
  {
    match: /almuerzo/i,
    transactions: [{ type: "expense", amount: 25900.5, description: "Almuerzo", category: "Alimentación" }],
  },
  {
    match: /quincena/i,
    transactions: [{ type: "income", amount: 2100000, description: "Quincena", category: "Salario" }],
  },
];

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => (data += chunk));
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

/** Respuesta con la forma de la Messages API, con el JSON que pide el esquema del bot. */
function claudeResponse(model, userMessage) {
  const text = userMessage.match(/<mensaje>\n([\s\S]*?)\n<\/mensaje>/)?.[1] ?? "";
  const today = userMessage.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1];
  claudeRequests.push(text);
  const found = INTERPRETATIONS.find((i) => i.match.test(text));
  const output = found
    ? { transactions: found.transactions.map((t) => ({ ...t, date: today })), reply: null }
    : { transactions: [], reply: "¿Cuánto fue y en qué? (respuesta del Claude falso)" };
  return {
    id: `msg_falso_${claudeRequests.length}`,
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: JSON.stringify(output) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (request.method === "GET" && url.pathname === "/salud") return json(response, 200, { ok: true });

    if (request.method === "POST" && /^\/graph\/[^/]+\/[^/]+\/messages$/.test(url.pathname)) {
      const body = JSON.parse(await readBody(request));
      sent.push({ to: body.to, text: body.text?.body ?? "", at: Date.now() });
      return json(response, 200, {
        messaging_product: "whatsapp",
        contacts: [{ input: body.to, wa_id: body.to }],
        messages: [{ id: `wamid.falso.${sent.length}` }],
      });
    }

    if (request.method === "GET" && url.pathname === "/mensajes") {
      const to = url.searchParams.get("to");
      return json(response, 200, sent.filter((m) => !to || m.to === to));
    }

    if (request.method === "POST" && url.pathname === "/anthropic/v1/messages") {
      const body = JSON.parse(await readBody(request));
      const userMessage = body.messages?.at(-1)?.content;
      return json(response, 200, claudeResponse(body.model, typeof userMessage === "string" ? userMessage : ""));
    }

    if (request.method === "GET" && url.pathname === "/claude") return json(response, 200, claudeRequests);

    if (request.method === "POST" && url.pathname === "/fallar") {
      failNext.add(url.searchParams.get("servicio"));
      return json(response, 200, { ok: true });
    }

    if (request.method === "GET" && /^\/graph\/[^/]+\/[^/]+$/.test(url.pathname)) {
      if (failNext.delete("whatsapp")) {
        // Lo que responde Meta con un token vencido.
        return json(response, 401, {
          error: { message: "Error validating access token: Session has expired.", type: "OAuthException", code: 190, fbtrace_id: "Afalso" },
        });
      }
      return json(response, 200, {
        verified_name: "Finanzas MVP (prueba)",
        display_phone_number: "+57 300 0000000",
        quality_rating: "GREEN",
        id: url.pathname.split("/").at(-1),
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/anthropic/v1/models/")) {
      if (failNext.delete("claude")) {
        return json(response, 401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
      }
      const id = decodeURIComponent(url.pathname.split("/").at(-1));
      return json(response, 200, { type: "model", id, display_name: "Claude falso", created_at: "2026-01-01T00:00:00Z", deprecated_at: null });
    }

    json(response, 404, { error: `ruta desconocida: ${request.method} ${url.pathname}` });
  } catch (error) {
    // El detalle va a la consola (lo muestra Playwright); la respuesta no expone el error.
    console.error("[servicios falsos]", error);
    json(response, 500, { error: "error interno del servidor falso" });
  }
});

server.listen(PORT, () => console.log(`Servicios falsos (WhatsApp y Claude) en http://localhost:${PORT}`));
