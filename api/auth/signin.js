// POST /api/auth/signin  { email, password }
import bcrypt from "bcryptjs";
import { sql, signSession, setSessionCookie, applyCors } from "../_db.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  try {
    const rows = await sql`SELECT id, email, name, org_id, password_hash FROM users WHERE email = ${email}`;
    const u = rows[0];
    // Generic message either way — do not reveal whether the email exists.
    const ok = u && (await bcrypt.compare(String(password), u.password_hash));
    if (!ok) return res.status(401).json({ error: "Incorrect email or password" });

    const token = await signSession({ sub: u.id, email: u.email, name: u.name, org_id: u.org_id });
    setSessionCookie(res, token);
    return res.status(200).json({ user: { id: u.id, email: u.email, name: u.name, orgId: u.org_id } });
  } catch (err) {
    console.error("signin error:", err && err.message);
    return res.status(500).json({ error: "signin failed" });
  }
}
