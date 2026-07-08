// POST /api/auth/reset  { token, password }
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sql, applyCors } from "../_db.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: "token and password required" });
  if (String(password).length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });

  try {
    const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
    const rows = await sql`
      SELECT id, user_id FROM password_resets
      WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()`;
    if (!rows.length) return res.status(400).json({ error: "invalid or expired reset link" });

    const hash = await bcrypt.hash(String(password), 12);
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${rows[0].user_id}`;
    await sql`UPDATE password_resets SET used_at = now() WHERE id = ${rows[0].id}`;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("reset error:", err && err.message);
    return res.status(500).json({ error: "reset failed" });
  }
}
