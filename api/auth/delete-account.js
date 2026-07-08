// POST /api/auth/delete-account
// Closes the account: deletes every Blob artifact the user owns, then deletes
// the user row (submissions/events/password_resets cascade via FK), then clears
// the session cookie. Supports the privacy copy's "or close your account".
import { del } from "@vercel/blob";
import { sql, getSessionUser, clearSessionCookie, applyCors } from "../_db.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSessionUser(req);
  if (!session) return res.status(401).json({ error: "not authenticated" });

  try {
    const rows = await sql`
      SELECT pdf_blob_url, original_scan_blob_url, signature_blob_url
      FROM submissions WHERE user_id = ${session.sub}`;
    const urls = rows.flatMap((r) =>
      [r.pdf_blob_url, r.original_scan_blob_url, r.signature_blob_url].filter(Boolean));
    if (urls.length) await del(urls).catch((e) => console.error("blob del error:", e && e.message));

    await sql`DELETE FROM users WHERE id = ${session.sub}`; // cascades to submissions/events/resets
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("delete-account error:", err && err.message);
    return res.status(500).json({ error: "account deletion failed" });
  }
}
