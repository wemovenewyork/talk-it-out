// Resend email helper. Not an HTTP handler. Used by auth/forgot and
// submissions/email. From-address is env-driven (staging can use resend.dev).
import { Resend } from "resend";

let _resend = null;
function client() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");
    _resend = new Resend(key);
  }
  return _resend;
}

export async function sendMail({ to, subject, html, attachments }) {
  const from = process.env.RESEND_FROM || "Talk It Out <onboarding@resend.dev>";
  const payload = { from, to, subject, html };
  if (attachments && attachments.length) payload.attachments = attachments;
  return await client().emails.send(payload);
}
