export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://talk-it-out-two.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const { imageData, mimeType } = req.body;
  if (!imageData || !mimeType) {
    return res.status(400).json({ error: "imageData and mimeType are required" });
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: `You are a document edge detector. When given an image, find the four outermost corners of the primary flat document (paper form, letter, or card) visible in the image. The document will typically be a white or light-colored rectangle against a darker surface.

Return ONLY a valid JSON object with no markdown, no explanation, no preamble:
{
  "found": true,
  "corners": {
    "topLeft":     { "x": 0, "y": 0 },
    "topRight":    { "x": 0, "y": 0 },
    "bottomLeft":  { "x": 0, "y": 0 },
    "bottomRight": { "x": 0, "y": 0 }
  },
  "confidence": "high"
}

Rules:
- Coordinates are pixel values measured from the top-left corner of the image (0,0)
- topLeft is the corner closest to the top-left of the image
- topRight is the corner closest to the top-right of the image
- bottomLeft is the corner closest to the bottom-left of the image
- bottomRight is the corner closest to the bottom-right of the image
- Include the full document including its edges and borders — do not crop inside the document
- If the document is slightly rotated, return the actual rotated corner positions
- If no document is clearly visible return: { "found": false }`,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: imageData
              }
            },
            {
              type: "text",
              text: "Detect the document corners in this image."
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error("Anthropic API error:", errBody);
      return res.status(200).json({ found: false, error: 'detection failed' });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text?.trim() || '';

    // Strip markdown backticks if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    let parsed = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
      }
    }

    if (!parsed) {
      return res.status(200).json({ found: false, error: 'parse failed' });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    console.error("scanDocument error:", error);
    return res.status(200).json({ found: false, error: 'detection failed' });
  }
}
