export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '20mb' } },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://talk-it-out-two.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const { imageData, mimeType } = req.body;
  if (!imageData || !mimeType) return res.status(400).json({ error: "imageData and mimeType required" });

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
        max_tokens: 2000,
        system: `You are a form field extractor. When given an image of a form, identify every field that needs to be filled in. For each field return its label, its approximate position as a fraction of image dimensions, and what type of input it expects.

Return ONLY valid JSON with no markdown, no preamble:
{
  "fields": [
    {
      "id": "field_1",
      "label": "Employee Name",
      "type": "text",
      "x": 0.12,
      "y": 0.18,
      "width": 0.45,
      "height": 0.04,
      "value": ""
    }
  ],
  "formType": "Workplace Incident Report",
  "confidence": "high"
}

Rules:
- x, y, width, height are decimal fractions of the full image dimensions (0.0 to 1.0)
- x and y mark the TOP LEFT corner of the field INPUT AREA — not the label
- type is one of: text, date, checkbox, signature, number
- label is the human-readable field name exactly as it appears on the form
- id is a unique snake_case identifier you generate (e.g. employee_name, incident_date)
- formType is your best guess at what kind of form this is
- Include every blank line, box, checkbox, or input area visible
- If you cannot identify any fields return: { "fields": [], "formType": "unknown" }`,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: imageData } },
            { type: "text", text: "Extract all form fields from this image. Return their labels, positions as 0-1 fractions, and types." }
          ]
        }]
      })
    });

    if (!response.ok) {
      console.error("Anthropic error:", await response.text().catch(() => ""));
      return res.status(200).json({ fields: [], formType: "unknown" });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text?.trim() || "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed = null;
    try { parsed = JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch { parsed = null; }
    }

    if (!parsed || !Array.isArray(parsed.fields)) {
      return res.status(200).json({ fields: [], formType: "unknown" });
    }

    // Sanitise: clamp all coords to [0,1]
    parsed.fields = parsed.fields.map((f, i) => ({
      id: f.id || `field_${i + 1}`,
      label: f.label || `Field ${i + 1}`,
      type: f.type || "text",
      x: Math.max(0, Math.min(1, Number(f.x) || 0)),
      y: Math.max(0, Math.min(1, Number(f.y) || 0)),
      width: Math.max(0.02, Math.min(1, Number(f.width) || 0.3)),
      height: Math.max(0.01, Math.min(1, Number(f.height) || 0.04)),
      value: ""
    }));

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("extractFields error:", err);
    return res.status(200).json({ fields: [], formType: "unknown" });
  }
}
