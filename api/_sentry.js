// Lightweight serverless Sentry capture (Phase 7). Lazy-inits @sentry/node once
// per instance; no-ops when SENTRY_DSN is unset. Never throws into the caller.
import * as Sentry from "@sentry/node";

let _inited = false;
function ensure() {
  if (_inited) return !!process.env.SENTRY_DSN;
  _inited = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  try {
    Sentry.init({
      dsn,
      release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
      environment: process.env.VERCEL_ENV || "development",
      tracesSampleRate: 0
    });
  } catch (e) { /* ignore */ }
  return true;
}

// Capture a server error with a context tag. Always also returns so callers can
// keep their existing console.error for Vercel logs.
export function captureServerError(err, endpoint) {
  try {
    if (!ensure()) return;
    Sentry.captureException(err, { tags: { endpoint: endpoint || "unknown" } });
  } catch (e) { /* never let telemetry break the handler */ }
}
