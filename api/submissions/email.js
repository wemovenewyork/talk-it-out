// POST /api/submissions/email  { id, to }
// Emails the stored FILLED scan-overlay PDF (from Blob) as an attachment via
// Resend. Never rebuilds a summary — attaches the real deliverable. Owner-only.
import { sql, getSessionUser, applyCors } from "../_db.js";
import { sendMail } from "../_mail.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSessionUser(req);
  if (!session) return res.status(401).json({ error: "not authenticated" });

  const { id, to } = req.body || {};
  if (!id || !to) return res.status(400).json({ error: "id and to required" });

  try {
    const rows = await sql`
      SELECT ref_code, form_type, pdf_blob_url FROM submissions
      WHERE id = ${id} AND user_id = ${session.sub}`;
    if (!rows.length) return res.status(404).json({ error: "not found" });
    const s = rows[0];
    if (!s.pdf_blob_url) return res.status(409).json({ error: "no PDF stored for this submission" });

    // Pull the filled PDF from Blob and attach it (base64) — the real form,
    // not a rebuilt summary.
    const pdfResp = await fetch(s.pdf_blob_url);
    if (!pdfResp.ok) return res.status(502).json({ error: "could not retrieve stored PDF" });
    const buf = Buffer.from(await pdfResp.arrayBuffer());
    const filename = `${s.ref_code || id}-${(s.form_type || "form").replace(/\s+/g, "-")}.pdf`;

    await sendMail({
      to,
      subject: `${s.form_type || "Completed form"} — ${s.ref_code || ""}`.trim(),
      html: `<p>Attached is your completed form${s.ref_code ? " (ref " + s.ref_code + ")" : ""}.</p><p>Sent via Talk It Out.</p>`,
      attachments: [{ filename, content: buf.toString("base64") }]
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("submissions/email error:", err && err.message);
    return res.status(500).json({ error: "email failed" });
  }
}
