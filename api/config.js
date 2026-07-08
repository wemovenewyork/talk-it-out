// GET /api/config — public runtime config for the static client (no secrets).
// The Sentry DSN is public by design (client-side error reporting). Lets the
// no-build static app.html pick up the DSN + release from env.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    sentryDsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "",
    release: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
    environment: process.env.VERCEL_ENV || "development"
  });
}
