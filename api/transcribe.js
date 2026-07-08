// Robust transcription endpoint (Phase 4). Accepts base64 audio and forwards it
// to Groq Whisper (whisper-large-v3-turbo), an OpenAI-compatible multipart API.
// Provider-agnostic on purpose: swapping to OpenAI whisper-1 is a few lines.
export const config = {
  maxDuration: 60,
  // base64 inflates ~33%; the client caps audio at 5MB so allow headroom.
  api: { bodyParser: { sizeLimit: '8mb' } },
};

const MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

// Map the app's language setting to an ISO-639-1 hint Whisper accepts.
const LANG_MAP = { en: "en", es: "es", ht: "ht", zh: "zh", ar: "ar" };

// Guess a filename extension from the mime so Groq's format detection is happy.
function extFor(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}

import { applyCors, requireAiSession } from "./_db.js";

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const session = await requireAiSession(req, res, "transcribe");
  if (!session) return;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "transcription not configured" });

  const { audio, mimeType, language } = req.body || {};
  if (typeof audio !== "string" || !audio) {
    return res.status(400).json({ error: "audio (base64) required" });
  }

  let buf;
  try { buf = Buffer.from(audio, "base64"); }
  catch { return res.status(400).json({ error: "invalid base64 audio" }); }
  if (!buf.length) return res.status(400).json({ error: "empty audio" });
  if (buf.length > MAX_AUDIO_BYTES) return res.status(413).json({ error: "audio too large (max 5MB)" });

  const lang = LANG_MAP[language] || null;

  try {
    const form = new FormData();
    form.append("file", new Blob([buf], { type: mimeType || "audio/webm" }), "audio." + extFor(mimeType));
    form.append("model", MODEL);
    form.append("response_format", "json");
    if (lang) form.append("language", lang);

    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
      body: form
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("Groq transcribe error:", r.status, detail.slice(0, 300));
      return res.status(502).json({ error: "transcription failed" });
    }

    const data = await r.json();
    return res.status(200).json({ transcript: (data && data.text ? String(data.text).trim() : ""), language: lang || "auto" });
  } catch (err) {
    console.error("transcribe error:", err && err.message);
    return res.status(500).json({ error: "transcription failed" });
  }
}
