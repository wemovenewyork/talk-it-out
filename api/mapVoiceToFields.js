export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '1mb' } },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://talk-it-out-two.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const { transcript, fields } = req.body;
  if (!transcript || !Array.isArray(fields)) {
    return res.status(400).json({ error: "transcript and fields required" });
  }

  const fieldList = fields.map(f => `- id: "${f.id}", label: "${f.label}", type: ${f.type}`).join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: `You are a form filling assistant. You will receive a voice transcript from a worker describing information for a form, and a list of form fields. Map the spoken information to the correct fields.

Return ONLY valid JSON with no markdown, no preamble:
{
  "mappings": [
    {
      "id": "field_1",
      "value": "Marcus Webb",
      "confidence": "high"
    }
  ],
  "unmapped": ["field_3", "field_5"],
  "summary": "One sentence summary of what the worker reported"
}

Rules:
- Only include fields where you found a clear match in the transcript
- confidence is high, medium, or low — low means you are guessing
- unmapped lists field ids where no information was found in the transcript
- For date fields format the value as MM/DD/YYYY
- For checkbox fields use "Yes" or "No"
- For number fields return only the numeric value as a string
- Never invent information that was not stated in the transcript
- Keep values concise — match the field type
- If the transcript contains no relevant information return: { "mappings": [], "unmapped": [...all field ids], "summary": "No relevant information found" }`,
        messages: [{
          role: "user",
          content: `Form fields:\n${fieldList}\n\nTranscript:\n"${transcript}"\n\nMap the transcript to the form fields.`
        }]
      })
    });

    if (!response.ok) {
      console.error("Anthropic error:", await response.text().catch(() => ""));
      return res.status(200).json({
        mappings: [],
        unmapped: fields.map(f => f.id),
        summary: "Mapping failed — please review manually"
      });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text?.trim() || "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed = null;
    try { parsed = JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch { parsed = null; }
    }

    if (!parsed || !Array.isArray(parsed.mappings)) {
      return res.status(200).json({
        mappings: [],
        unmapped: fields.map(f => f.id),
        summary: "Could not parse mapping response"
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("mapVoiceToFields error:", err);
    return res.status(200).json({
      mappings: [],
      unmapped: fields.map(f => f.id),
      summary: "Mapping failed"
    });
  }
}
