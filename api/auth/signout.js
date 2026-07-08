// POST /api/auth/signout  -> clears the session cookie
import { clearSessionCookie, applyCors } from "../_db.js";

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
