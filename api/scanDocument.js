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
        system: `You are a precise document boundary detector. Your only job is to find the four physical corners of a paper document in a photo.

CRITICAL: You must find the corners of the PAPER ITSELF — not the text, not the printed content, not the margins. Find where the physical edge of the paper meets the background surface.

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

Rules:
- Coordinates are INTEGER pixel values from the top-left of the image (0,0)
- The image dimensions are given in the user message — do NOT exceed them
- topLeft: the corner of the paper closest to the image's top-left
- topRight: the corner of the paper closest to the image's top-right
- bottomLeft: the corner of the paper closest to the image's bottom-left
- bottomRight: the corner of the paper closest to the image's bottom-right
- Place each coordinate AT the physical edge of the paper, not inside it
- If the paper is rotated, return the actual pixel positions of the rotated corners
- If you cannot find a clear paper document, return: { "found": false }`,
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
