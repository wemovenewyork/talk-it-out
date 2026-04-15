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

  const { imageData, mimeType, imageWidth, imageHeight } = req.body;
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
        system: `You are a precise document boundary detector. Your only job is to locate the four physical corner pixels of a paper document in a photo.

CRITICAL RULES — read carefully:
1. Find the corners of the PHYSICAL PAPER SHEET — the outermost edge where the paper ends and the table/background begins.
2. Do NOT find corners of the text, the printed content, the margins, or any inner boundary.
3. Your coordinates must be AT the paper's outer edge — the very last pixel of the paper before the background.
4. Common mistake to avoid: placing corners 20-50px inside the true paper edge. Your corners must be at the physical boundary.

Return ONLY a valid JSON object, no markdown, no explanation:
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

- Coordinates are INTEGER pixel values from the top-left of the image (0,0)
- The image dimensions are given in the user message — do NOT exceed them
- topLeft: paper corner nearest the image's top-left
- topRight: paper corner nearest the image's top-right
- bottomLeft: paper corner nearest the image's bottom-left
- bottomRight: paper corner nearest the image's bottom-right
- If the paper is rotated, return the actual rotated corner pixel positions
- If no paper document is visible, return: { "found": false }`,
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
              text: `This image is ${imageWidth || '?'} x ${imageHeight || '?'} pixels. Find the four corners of the physical paper document. Return the pixel coordinates of the outermost edges of the paper itself, not the content printed on it.`
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
