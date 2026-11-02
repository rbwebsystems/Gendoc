import Anthropic from "@anthropic-ai/sdk";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * GenDoc fayl oxuma servisi.
 * Brauzer faylı (şəkil / PDF / Excel və Word-dən çıxarılmış mətn) göndərir,
 * Claude sifariş və ya təchizatçı təklifi sətirlərini JSON kimi qaytarır.
 * API açarı yalnız burada saxlanılır — brauzerə heç vaxt getmir.
 */

interface Env {
  ANTHROPIC_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
}

type FilePayload =
  | { kind: "image"; name: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string }
  | { kind: "pdf"; name: string; data: string }
  | { kind: "text"; name: string; text: string };

type OrderItemRef = { id: string; name: string; qty: number | null; unit: string };

type ExtractRequest =
  | { mode: "order"; file: FilePayload }
  | { mode: "quote"; file: FilePayload; orderItems: OrderItemRef[] };

const MODEL = "claude-opus-5-5";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

const nullable = (type: "string" | "number") => ({ anyOf: [{ type }, { type: "null" }] });

const ORDER_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: nullable("number"),
          unit: { type: "string" },
          note: { type: "string" },
        },
        required: ["name", "qty", "unit", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const QUOTE_SCHEMA = {
  type: "object",
  properties: {
    supplierName: { type: "string" },
    currency: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          orderItemId: nullable("string"),
          matchType: { type: "string", enum: ["exact", "alternative", "uncertain", "unmatched"] },
          offeredName: { type: "string" },
          qty: nullable("number"),
          unitPrice: nullable("number"),
          totalPrice: nullable("number"),
          note: { type: "string" },
        },
        required: ["orderItemId", "matchType", "offeredName", "qty", "unitPrice", "totalPrice", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["supplierName", "currency", "lines"],
  additionalProperties: false,
};

const ORDER_SYSTEM = `You read purchase orders that companies send to a supplier in Azerbaijan. Documents may be in Azerbaijani, Russian or English and arrive as photos, scans, PDFs, spreadsheets or Word files.

Return every product line the customer is ordering, in document order:
- name: the product name exactly as written, including brand, model code and specifications. Do not translate or shorten it.
- qty: the requested quantity as a number; null if none is given.
- unit: the unit as written (ədəd, kq, m, dəst, pcs...); empty string if none.
- note: any extra per-line remark (colour, deadline, comment); empty string if none.

Skip headers, totals, signatures, stamps and company details. If a line is hard to read, still include your best reading and say so in note.`;

const QUOTE_SYSTEM = `You read price offers that suppliers send in reply to a customer's order. Documents may be in Azerbaijani, Russian or English and arrive as photos, scans, PDFs, spreadsheets or Word files.

You get the customer's order lines (each with an id) and the supplier's document. Return one entry per product line in the supplier's document:
- orderItemId: the id of the order line this offer answers; null if it answers none.
- matchType: "exact" when it is the requested product; "alternative" when the supplier offers a different product as a substitute for that order line (other brand, model or spec); "uncertain" when you cannot tell which order line it belongs to with confidence; "unmatched" when it relates to no order line.
- offeredName: the product name exactly as the supplier wrote it.
- qty: offered quantity; null if not stated.
- unitPrice: price per unit as a number; null if not stated. If only a line total and quantity are given, derive it.
- totalPrice: line total; null if not stated.
- note: availability, delivery time, warranty or other remarks; empty string if none.
Also return supplierName (as printed on the document, or empty string) and currency (ISO code such as AZN, USD; AZN if not stated).

Match by meaning, not only identical text: model codes, brand and key specs matter most. Never invent prices.`;

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  const allow = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function verifyFirebaseToken(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  try {
    await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    });
    return true;
  } catch {
    return false;
  }
}

function fileBlock(file: FilePayload): Anthropic.Beta.BetaContentBlockParam {
  if (file.kind === "image") {
    return { type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data } };
  }
  if (file.kind === "pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } };
  }
  return { type: "text", text: `<document name="${file.name}">\n${file.text}\n</document>` };
}

function isExtractRequest(body: unknown): body is ExtractRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as { mode?: unknown; file?: { kind?: unknown }; orderItems?: unknown };
  if (b.mode !== "order" && b.mode !== "quote") return false;
  if (!b.file || !["image", "pdf", "text"].includes(String(b.file.kind))) return false;
  if (b.mode === "quote" && !Array.isArray(b.orderItems)) return false;
  return true;
}

async function extract(req: ExtractRequest, env: Env): Promise<unknown> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [fileBlock(req.file)];
  if (req.mode === "quote") {
    content.push({
      type: "text",
      text: `Customer order lines:\n${JSON.stringify(req.orderItems)}\n\nRead the supplier offer above and match its lines to these order lines.`,
    });
  } else {
    content.push({ type: "text", text: "Read the customer order above and list its product lines." });
  }

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: req.mode === "order" ? ORDER_SCHEMA : QUOTE_SCHEMA },
    },
    system: req.mode === "order" ? ORDER_SYSTEM : QUOTE_SYSTEM,
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new ExtractError("Fayl oxunmadı (model imtina etdi).", 422);
  if (message.stop_reason === "max_tokens") throw new ExtractError("Fayl çox böyükdür, hissələrə bölün.", 413);
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text);
}

class ExtractError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request.headers.get("Origin"), env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/extract") {
      return json({ error: "Tapılmadı" }, 404, cors);
    }
    if (!(await verifyFirebaseToken(request, env))) {
      return json({ error: "Giriş tələb olunur" }, 401, cors);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Yanlış sorğu" }, 400, cors);
    }
    if (!isExtractRequest(body)) return json({ error: "Yanlış sorğu" }, 400, cors);

    try {
      return json(await extract(body, env), 200, cors);
    } catch (err) {
      if (err instanceof ExtractError) return json({ error: err.message }, err.status, cors);
      if (err instanceof Anthropic.BadRequestError) return json({ error: `Fayl qəbul edilmədi: ${err.message}` }, 400, cors);
      if (err instanceof Anthropic.AuthenticationError) return json({ error: "Server API açarı yanlışdır" }, 500, cors);
      if (err instanceof Anthropic.RateLimitError) return json({ error: "Çox sorğu, bir az sonra yenidən yoxlayın" }, 429, cors);
      if (err instanceof Anthropic.APIError) return json({ error: `Claude xətası (${err.status})` }, 502, cors);
      if (err instanceof SyntaxError) return json({ error: "Cavab oxunmadı, yenidən yoxlayın" }, 502, cors);
      return json({ error: "Gözlənilməz xəta" }, 500, cors);
    }
  },
};
