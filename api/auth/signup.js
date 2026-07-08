// POST /api/auth/signup  { email, name, password, orgCode? }
import bcrypt from "bcryptjs";
import { sql, signSession, setSessionCookie, applyCors } from "../_db.js";
import { captureServerError } from "../_sentry.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, name, password, orgCode } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: "email, name, password required" });
  if (String(password).length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });

  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length) return res.status(409).json({ error: "An account with that email already exists" });

    let orgId = null;
    if (orgCode) {
      const org = await sql`SELECT id FROM orgs WHERE code = ${String(orgCode).toUpperCase()}`;
      if (org.length) orgId = org[0].id;
    }

    const hash = await bcrypt.hash(String(password), 12);
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, org_id)
      VALUES (${email}, ${name}, ${hash}, ${orgId})
      RETURNING id, email, name, org_id`;
    const u = rows[0];

    const token = await signSession({ sub: u.id, email: u.email, name: u.name, org_id: u.org_id });
    setSessionCookie(res, token);
    return res.status(200).json({ user: { id: u.id, email: u.email, name: u.name, orgId: u.org_id } });
  } catch (err) {
    console.error("signup error:", err && err.message);
    captureServerError(err, "auth/signup");
    return res.status(500).json({ error: "signup failed" });
  }
}
