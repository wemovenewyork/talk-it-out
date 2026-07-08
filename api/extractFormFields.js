// Purpose-built form-field extraction endpoint. Replaces the three generic
// /api/chat call sites (single image, multi-page PDF images, and document text).
// Model, system prompt, and max_tokens are hardcoded server-side; the client
// sends only the minimal input data. Follows the api/extractFields.js pattern.
export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '20mb' } },
};

const MODEL = process.env.EXTRACT_FORM_FIELDS_MODEL || "claude-sonnet-4-6";

// Env-driven CORS allowlist. Reflect the request Origin only if it is on the
// comma-separated ALLOWED_ORIGINS list; allow same-origin (no Origin header).
function applyCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map(o => o.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-tio-app");
}

// TODO(phase5): interim app gate. A secret in client HTML is obfuscation, not
// security — real gate is the session cookie required on all AI endpoints in
// Phase 5. Soft check: only enforced when APP_SHARED_SECRET is configured, so
// the app keeps working if it is unset.
function appSecretOk(req) {
  const secret = process.env.APP_SHARED_SECRET;
  if (!secret) return true;
  return req.headers["x-tio-app"] === secret;
}

const IMAGE_SYSTEM = `You are a form field extractor. Given one or more images of a workplace form, identify every field that needs to be filled in.

Return ONLY a JSON array, no markdown, no preamble. Each item:
{ "name": string, "type": "short_text"|"long_text"|"date"|"checkbox"|"signature", "required": boolean, "x": number, "y": number, "w": number, "h": number }

Rules:
- x and y are the TOP-LEFT corner of the field INPUT AREA (not the label), as a percentage of the FIRST image's width and height (0-100).
- w and h are the field's width and height as percentages (0-100).
- name is the human-readable field label exactly as it appears on the form.
- Include every blank line, box, checkbox, or input area visible across all pages.
- If you cannot read the form, return exactly: { "error": "cannot_read" }`;

const TEXT_SYSTEM = `You are a form field extractor. Given the text of a workplace form document, identify every field that needs to be filled in.

Return ONLY a JSON array, no markdown, no preamble. Each item:
{ "name": string, "type": "short_text"|"long_text"|"date"|"checkbox"|"signature", "required": boolean }

Rules:
- name is the human-readable field label exactly as it appears in the document.
- If you cannot identify form fields, return exactly: { "error": "cannot_read" }`;

function parseArray(raw) {
  const text = String(raw || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { const p = JSON.parse(text); return p; } catch {}
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch {} }
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch {} }
  return null;
}

const clampPct = (n, d) => Math.max(0, Math.min(100, Number.isFinite(Number(n)) ? Number(n) : d));

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!appSecretOk(req)) return res.status(401).json({ error: "unauthorized" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const { images, mimeType, text } = req.body || {};
  const hasImages = Array.isArray(images) && images.length > 0;
  const hasText = typeof text === "string" && text.trim().length >= 10;
  if (!hasImages && !hasText) {
    return res.status(400).json({ error: "images[] or text required" });
  }

  // Build the message content + choose the right prompt/limits per input type.
  let system, maxTokens, userContent;
  if (hasImages) {
    system = IMAGE_SYSTEM;
    maxTokens = 2000;
    const media = (mimeType && String(mimeType).startsWith("image/")) ? mimeType : "image/jpeg";
    userContent = images.slice(0, 8).map(data => ({
      type: "image", source: { type: "base64", media_type: media, data }
    }));
    userContent.push({ type: "text", text: "Extract all form fields from this workplace form. Return only the JSON array described in the system prompt." });
  } else {
    system = TEXT_SYSTEM;
    maxTokens = 1000;
    userContent = `Extract all form fields from this workplace form document text. Return only the JSON array.\n\nDocument text:\n${text.slice(0, 8000)}`;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }]
      })
    });

    if (!response.ok) {
      console.error("extractFormFields Anthropic error:", response.status);
      return res.status(200).json({ fields: [], error: "extract_failed" });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text?.trim() || "";
    const parsed = parseArray(raw);

    if (!parsed || parsed.error === "cannot_read" || !Array.isArray(parsed) || parsed.length === 0) {
      return res.status(200).json({ fields: [], error: "cannot_read" });
    }

    // Normalise: keep the exact client schema, clamp coords when present.
    const fields = parsed.map(f => {
      const out = {
        name: String(f.name || "Field"),
        type: f.type || "short_text",
        required: !!f.required
      };
      if (f.x !== undefined || f.y !== undefined) {
        out.x = clampPct(f.x, 0);
        out.y = clampPct(f.y, 0);
        out.w = clampPct(f.w, 30);
        out.h = clampPct(f.h, 4);
      }
      return out;
    });

    return res.status(200).json({ fields });
  } catch (err) {
    console.error("extractFormFields error:", err && err.message);
    return res.status(200).json({ fields: [], error: "extract_failed" });
  }
}
