// POST /api/submissions/update  { id, fields?, transcript?, formType? }
import { sql, getSessionUser, applyCors } from "../_db.js";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSessionUser(req);
  if (!session) return res.status(401).json({ error: "not authenticated" });

  const { id, fields, transcript, formType } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    // COALESCE keeps existing values when a field is omitted. Ownership enforced
    // by the user_id predicate.
    const rows = await sql`
      UPDATE submissions SET
        fields = COALESCE(${fields ? JSON.stringify(fields) : null}::jsonb, fields),
        transcript = COALESCE(${transcript ?? null}, transcript),
        form_type = COALESCE(${formType ?? null}, form_type)
      WHERE id = ${id} AND user_id = ${session.sub}
      RETURNING id`;
    if (!rows.length) return res.status(404).json({ error: "not found" });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("submissions/update error:", err && err.message);
    return res.status(500).json({ error: "update failed" });
  }
}
