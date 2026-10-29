#!/usr/bin/env node
// Servidores falsos de WhatsApp (Graph API), de Claude y de GitHub para las pruebas E2E. La app los
// usa en vez de los reales (WHATSAPP_API_URL, ANTHROPIC_BASE_URL y GITHUB_API_URL apuntan aquí): nada
// sale a internet ni gasta créditos. Lo levanta Playwright (webServer en playwright.config.ts).
//
//   POST /graph/<versión>/<teléfono>/messages  → guarda el mensaje que "envió" el bot
//   GET  /mensajes?to=<número>                 → los mensajes que recibió ese número
//   POST /anthropic/v1/messages                → respuesta fija según el texto del usuario
//   GET  /claude                               → los textos que la app le pidió interpretar ("[foto] …" si
//                                                 venían con una foto)
//   GET  /graph/<versión>/<teléfono>           → el número del bot (Probar conexiones en /admin/salud)
//   GET  /graph/<versión>/<id de una foto>     → la dirección de una foto (MEDIA), como la da Meta
//   GET  /media-file/<id>                      → la foto (con el token, como en Meta)
//   GET  /anthropic/v1/models/<modelo>         → el modelo del bot (Probar conexiones)
//   POST /fallar?servicio=whatsapp|claude      → la próxima consulta de ese servicio responde 401
//   POST /fallar?servicio=envio&to=<número>     → el próximo mensaje a ese número no sale (400 de Meta)
//   POST /restablecer                           → sin fallos pendientes de whatsapp ni claude (al empezar
//                                                 la prueba que los usa: un intento anterior caído pudo dejar uno)
//   GET  /github/repos/<dueño>/<repo>/releases → dos releases fijas (Despliegues recientes en /admin/salud)
//   GET  /salud                                → para saber que ya arrancó

import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_SERVICES_PORT ?? 3101);
const sent = [];
const claudeRequests = [];
// Las consultas de Probar conexiones que deben fallar una vez (solo las usa esa prueba).
const failNext = new Set();

// Las releases del GitHub falso, como las devuelve la API (la más nueva primero).
const RELEASES = [
  {
    tag_name: "v9.2.0",
    published_at: "2026-10-20T15:00:00Z",
    target_commitish: "e2e0000000000000000000000000000000000002",
    html_url: "https://github.com/santirogu/finanzas-mvp-wp-bot/releases/tag/v9.2.0",
    body: "### ✨ Funcionalidades\n\n- **web:** salud del sistema (#901)\n- **bot:** responder más rápido (#902)\n\n### 🐛 Correcciones\n\n- **web:** un detalle (#903)\n- **web:** otro detalle (#904)\n- **web:** el último (#905)\n",
    draft: false,
  },
  {
    tag_name: "v9.1.0",
    published_at: "2026-10-18T15:00:00Z",
    target_commitish: "e2e0000000000000000000000000000000000001",
    html_url: "https://github.com/santirogu/finanzas-mvp-wp-bot/releases/tag/v9.1.0",
    body: "### 🧰 Mantenimiento\n\n- **deps:** actualizar Next (#900)\n",
    draft: false,
  },
];

// Las fotos que "recibió" el WhatsApp falso, por su id: la de una factura (un PNG de 1×1 basta). El Claude
// falso la reconoce por sus bytes, así la prueba ve que el bot le mandó la foto que bajó de Meta.
const RECEIPT_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const MEDIA = new Map([["7770001", RECEIPT_PNG]]);
const RECEIPT = [{ type: "expense", amount: 85400, description: "Éxito", category: "Mercado" }];

// Lo que "entiende" el Claude falso: frases fijas de las pruebas.
const INTERPRETATIONS = [
  {
    match: /zapatos/i,
    transactions: [{ type: "expense", amount: 500000, description: "Zapatos", category: "Ropa" }],
  },
  // Una cuenta en inglés: las categorías siguen en español (es lo que el bot le manda a Claude).
  {
    match: /shoes/i,
    transactions: [{ type: "expense", amount: 500000, description: "Shoes", category: "Ropa" }],
  },
  {
    match: /almuerzo/i,
    transactions: [{ type: "expense", amount: 25900.5, description: "Almuerzo", category: "Alimentación" }],
  },
  {
    match: /quincena/i,
    transactions: [{ type: "income", amount: 2100000, description: "Quincena", category: "Salario" }],
  },
  // Para la descripción del historial: Claude lo entiende así, y el bot guarda la que ya estaba.
  {
    match: /claro amor/i,
    transactions: [{ type: "expense", amount: 98000, description: "Pago claro amor", category: "Otros" }],
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

/**
 * Respuesta con la forma de la Messages API, con el JSON que pide el esquema del bot. `content` es el texto del
 * mensaje o, con una foto, la lista de bloques (la imagen y el texto).
 */
function claudeResponse(model, content) {
  const blocks = Array.isArray(content) ? content : [{ type: "text", text: typeof content === "string" ? content : "" }];
  const userMessage = blocks.find((b) => b.type === "text")?.text ?? "";
  const image = blocks.find((b) => b.type === "image");
  const text = userMessage.match(/<mensaje>\n([\s\S]*?)\n<\/mensaje>/)?.[1] ?? "";
  const today = userMessage.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1];
  claudeRequests.push(image ? `[foto] ${text}`.trim() : text);
  const transactions = image
    ? image.source?.data === RECEIPT_PNG ? RECEIPT : null
    : INTERPRETATIONS.find((i) => i.match.test(text))?.transactions;
  const output = transactions
    ? { transactions: transactions.map((t) => ({ ...t, date: today })), reply: null }
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
      // Lo que responde Meta con un número fuera de la lista de prueba (solo ese número, una vez).
      if (failNext.delete(`envio:${body.to}`)) {
        return json(response, 400, {
          error: { message: "(#131030) Recipient phone number not in allowed list", type: "OAuthException", code: 131030 },
        });
      }
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
      return json(response, 200, claudeResponse(body.model, body.messages?.at(-1)?.content));
    }

    if (request.method === "GET" && url.pathname === "/claude") return json(response, 200, claudeRequests);

    if (request.method === "POST" && url.pathname === "/restablecer") {
      failNext.delete("whatsapp");
      failNext.delete("claude");
      return json(response, 200, { ok: true });
    }

    if (request.method === "POST" && url.pathname === "/fallar") {
      const service = url.searchParams.get("servicio");
      failNext.add(service === "envio" ? `envio:${url.searchParams.get("to")}` : service);
      return json(response, 200, { ok: true });
    }

    // Las fotos: Meta da primero la dirección (con el token) y desde ahí se baja el archivo (también con el token).
    const mediaId = url.pathname.match(/^\/graph\/[^/]+\/(\d+)$/)?.[1] ?? url.pathname.match(/^\/media-file\/(\d+)$/)?.[1];
    if (request.method === "GET" && mediaId && MEDIA.has(mediaId)) {
      if (!request.headers.authorization?.startsWith("Bearer ")) return json(response, 401, { error: { message: "sin token", code: 190 } });
      const file = Buffer.from(MEDIA.get(mediaId), "base64");
      if (url.pathname.startsWith("/graph/")) {
        return json(response, 200, {
          messaging_product: "whatsapp",
          url: `http://localhost:${PORT}/media-file/${mediaId}`,
          mime_type: "image/png",
          file_size: file.length,
          id: mediaId,
        });
      }
      response.writeHead(200, { "content-type": "image/png", "content-length": file.length });
      return response.end(file);
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

    if (request.method === "GET" && /^\/github\/repos\/[^/]+\/[^/]+\/releases$/.test(url.pathname)) return json(response, 200, RELEASES);

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

// Las conexiones inactivas no se cierran durante una prueba. Node las cierra a los 5 s, y el `request`
// de Playwright las reutiliza: si una prueba vuelve a consultar justo entonces, el pedido se corta
// ("socket hang up", ECONNRESET) y la prueba falla de forma intermitente.
server.keepAliveTimeout = 10 * 60_000;

server.listen(PORT, () => console.log(`Servicios falsos (WhatsApp, Claude y GitHub) en http://localhost:${PORT}`));
