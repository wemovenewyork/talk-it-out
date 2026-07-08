// POST /api/submissions/create  { refCode, formType, fields, transcript }  -> { id, refCode }
import { sql, getSessionUser, applyCors } from "../_db.js";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSessionUser(req);
  if (!session) return res.status(401).json({ error: "not authenticated" });

  const { refCode, formType, fields, transcript } = req.body || {};
  try {
    const rows = await sql`
      INSERT INTO submissions (user_id, ref_code, form_type, status, fields, transcript)
      VALUES (${session.sub}, ${refCode || ""}, ${formType || null}, 'draft',
              ${JSON.stringify(fields || [])}::jsonb, ${transcript || null})
      RETURNING id, ref_code`;
    return res.status(200).json({ id: rows[0].id, refCode: rows[0].ref_code });
  } catch (err) {
    console.error("submissions/create error:", err && err.message);
    return res.status(500).json({ error: "create failed" });
  }
}
