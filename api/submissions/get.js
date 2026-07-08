// GET /api/submissions/get?id=<uuid>  -> { submission }  (owner only)
import { sql, getSessionUser, applyCors } from "../_db.js";

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSessionUser(req);
  if (!session) return res.status(401).json({ error: "not authenticated" });

  const id = req.query && req.query.id;
  if (!id) return res.status(400).json({ error: "id required" });

  try {
    const rows = await sql`
      SELECT id, ref_code, form_type, status, fields, transcript,
             pdf_blob_url, original_scan_blob_url, signature_blob_url,
             amended_from, created_at, completed_at
      FROM submissions WHERE id = ${id} AND user_id = ${session.sub}`;
    if (!rows.length) return res.status(404).json({ error: "not found" });
    return res.status(200).json({ submission: rows[0] });
  } catch (err) {
    console.error("submissions/get error:", err && err.message);
    return res.status(500).json({ error: "get failed" });
  }
}
