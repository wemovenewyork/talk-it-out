// POST /api/submissions/delete  { id }
// R5: deletion must be TRUE — remove the Blob artifacts (PDF, scan, signature)
// AND the row, so the files return 404 afterward. Owner-only.
import { del } from "@vercel/blob";
import { sql, getSessionUser, applyCors } from "../_db.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSessionUser(req);
  if (!session) return res.status(401).json({ error: "not authenticated" });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });

  try {
    const rows = await sql`
      SELECT pdf_blob_url, original_scan_blob_url, signature_blob_url
      FROM submissions WHERE id = ${id} AND user_id = ${session.sub}`;
    if (!rows.length) return res.status(404).json({ error: "not found" });

    const urls = [rows[0].pdf_blob_url, rows[0].original_scan_blob_url, rows[0].signature_blob_url].filter(Boolean);
    if (urls.length) {
      // del() accepts an array of URLs; ignore individual-file errors so a
      // missing blob never blocks the row deletion.
      await del(urls).catch((e) => console.error("blob del error:", e && e.message));
    }
    await sql`DELETE FROM submissions WHERE id = ${id} AND user_id = ${session.sub}`;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("submissions/delete error:", err && err.message);
    return res.status(500).json({ error: "delete failed" });
  }
}
