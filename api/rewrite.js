// Purpose-built transcript rewrite endpoint. Replaces the generic /api/chat
// call in callRewriteAPI. Model, system prompt, and max_tokens are hardcoded
// server-side; the client sends only { transcript, tone }.
export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '1mb' } },
};

const MODEL = process.env.REWRITE_MODEL || "claude-sonnet-4-6";

// Allowed tone presets → their instruction. Anything else falls back to professional.
const TONES = {
  professional: " Use formal, professional workplace documentation language.",
  concise: " Be concise and brief.",
  detailed: " Include thorough detail.",
  plain: " Use simple, plain language."
};

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

// TODO(phase5): interim app gate — see extractFormFields.js. Soft check.
function appSecretOk(req) {
  const secret = process.env.APP_SHARED_SECRET;
  if (!secret) return true;
  return String(req.headers["x-tio-app"] || "").trim() === secret.trim();
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!appSecretOk(req)) return res.status(401).json({ error: "unauthorized" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const { transcript, tone } = req.body || {};
  if (typeof transcript !== "string" || !transcript.trim()) {
    return res.status(400).json({ error: "transcript required" });
  }
  const toneInstr = TONES[tone] || TONES.professional;

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
        max_tokens: 500,
        system: "You rewrite spoken workplace accounts into clear written documentation. Preserve all facts exactly and never invent information. Return only the rewritten text, no preamble.",
        messages: [{
          role: "user",
          content: `Rewrite the following spoken account into formal, professional workplace documentation language. Preserve all facts exactly.${toneInstr}\n\n${transcript.slice(0, 6000)}`
        }]
      })
    });

    if (!response.ok) {
      console.error("rewrite Anthropic error:", response.status);
      // Graceful degradation: caller falls back to the original transcript.
      return res.status(200).json({ text: transcript });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || transcript;
    return res.status(200).json({ text });
  } catch (err) {
    console.error("rewrite error:", err && err.message);
    return res.status(200).json({ text: transcript });
  }
}
