// POST /api/submissions/amend  { id }  -> { id: <newDraftId> }
// Creates a new draft linked to the original via amended_from, copying its
// fields/transcript so the worker can correct and re-file.
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
    const orig = await sql`
      SELECT ref_code, form_type, fields, transcript
      FROM submissions WHERE id = ${id} AND user_id = ${session.sub}`;
    if (!orig.length) return res.status(404).json({ error: "not found" });
    const o = orig[0];
    const rows = await sql`
      INSERT INTO submissions (user_id, ref_code, form_type, status, fields, transcript, amended_from)
      VALUES (${session.sub}, ${o.ref_code}, ${o.form_type}, 'amended',
              ${JSON.stringify(o.fields)}::jsonb, ${o.transcript}, ${id})
      RETURNING id`;
    return res.status(200).json({ id: rows[0].id });
  } catch (err) {
    console.error("submissions/amend error:", err && err.message);
    return res.status(500).json({ error: "amend failed" });
  }
}
