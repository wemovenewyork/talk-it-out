// GET /api/submissions/list  -> { submissions: [...] }  (current user's history)
import { sql, getSessionUser, applyCors } from "../_db.js";

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSessionUser(req);
  if (!session) return res.status(401).json({ error: "not authenticated" });

  try {
    const rows = await sql`
      SELECT id, ref_code, form_type, status, pdf_blob_url, created_at, completed_at, amended_from
      FROM submissions WHERE user_id = ${session.sub}
      ORDER BY created_at DESC LIMIT 200`;
    return res.status(200).json({ submissions: rows });
  } catch (err) {
    console.error("submissions/list error:", err && err.message);
    return res.status(500).json({ error: "list failed" });
  }
}
