// POST /api/submissions/complete
//   { id, fields?, transcript?, pdfBase64?, scanBase64?, signatureBase64? }
// Uploads the final artifacts to Vercel Blob and marks the submission completed.
import { sql, getSessionUser, applyCors, logEvent } from "../_db.js";
import { uploadBase64 } from "../_blob.js";

export const config = { api: { bodyParser: { sizeLimit: "20mb" } } };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSessionUser(req);
  if (!session) return res.status(401).json({ error: "not authenticated" });

  const { id, fields, transcript, pdfBase64, scanBase64, signatureBase64 } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });

  try {
    // Confirm ownership before spending Blob uploads.
    const owned = await sql`SELECT ref_code FROM submissions WHERE id = ${id} AND user_id = ${session.sub}`;
    if (!owned.length) return res.status(404).json({ error: "not found" });
    const ref = owned[0].ref_code || id;

    const [pdfUrl, scanUrl, sigUrl] = await Promise.all([
      uploadBase64(`submissions/${ref}/form.pdf`, pdfBase64, "application/pdf"),
      uploadBase64(`submissions/${ref}/scan.jpg`, scanBase64, "image/jpeg"),
      uploadBase64(`submissions/${ref}/signature.png`, signatureBase64, "image/png")
    ]);

    await sql`
      UPDATE submissions SET
        status = 'completed',
        completed_at = now(),
        fields = COALESCE(${fields ? JSON.stringify(fields) : null}::jsonb, fields),
        transcript = COALESCE(${transcript ?? null}, transcript),
        pdf_blob_url = COALESCE(${pdfUrl}, pdf_blob_url),
        original_scan_blob_url = COALESCE(${scanUrl}, original_scan_blob_url),
        signature_blob_url = COALESCE(${sigUrl}, signature_blob_url)
      WHERE id = ${id} AND user_id = ${session.sub}`;

    await logEvent(session.sub, "submission_completed", { form_type: null }, id);
    return res.status(200).json({ id, pdfUrl, scanUrl, signatureUrl: sigUrl });
  } catch (err) {
    console.error("submissions/complete error:", err && err.message);
    return res.status(500).json({ error: "complete failed" });
  }
}
