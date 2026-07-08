// POST /api/auth/forgot  { email }  — always 200 (no email enumeration)
import crypto from "crypto";
import { sql, applyCors } from "../_db.js";
import { sendMail } from "../_mail.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body || {};
  // Always respond 200 regardless of whether the account exists.
  const done = () => res.status(200).json({ ok: true });
  if (!email) return done();

  try {
    const rows = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (!rows.length) return done();

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await sql`
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES (${rows[0].id}, ${tokenHash}, now() + interval '1 hour')`;

    const origin = (process.env.ALLOWED_ORIGINS || "").split(",")[0].trim() || "https://talk-it-out-two.vercel.app";
    const link = `${origin}/app.html#reset=${token}`;
    await sendMail({
      to: email,
      subject: "Reset your Talk It Out password",
      html: `<p>Tap the link below to reset your password. It expires in 1 hour.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`
    }).catch((e) => console.error("forgot mail error:", e && e.message));
  } catch (err) {
    console.error("forgot error:", err && err.message);
  }
  return done();
}
