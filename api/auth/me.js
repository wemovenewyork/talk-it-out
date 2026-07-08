// GET /api/auth/me  -> { user } or 401
import { sql, getSessionUser, applyCors } from "../_db.js";

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSessionUser(req);
  if (!session) return res.status(401).json({ error: "not authenticated" });

  try {
    const rows = await sql`SELECT id, email, name, org_id, personal_email FROM users WHERE id = ${session.sub}`;
    if (!rows.length) return res.status(401).json({ error: "not authenticated" });
    const u = rows[0];
    return res.status(200).json({ user: { id: u.id, email: u.email, name: u.name, orgId: u.org_id, personalEmail: u.personal_email } });
  } catch (err) {
    console.error("me error:", err && err.message);
    return res.status(500).json({ error: "failed" });
  }
}
