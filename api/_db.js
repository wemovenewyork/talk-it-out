// Shared DB + session helpers for Phase 5 (Neon Postgres + JWT cookie auth).
// Imported by the auth and submissions endpoints. Not an HTTP handler itself.
import { neon } from "@neondatabase/serverless";
import { SignJWT, jwtVerify } from "jose";

// Lazily create the SQL client so importing this module never throws when
// DATABASE_URL is absent (e.g. during a build without the env configured).
let _sql = null;
export function sql(strings, ...values) {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not configured");
    _sql = neon(url);
  }
  return _sql(strings, ...values);
}

const COOKIE = "tio_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function secretKey() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not configured");
  return new TextEncoder().encode(s);
}

export async function signSession(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  raw.split(";").forEach(function (p) {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Returns the verified session payload { sub, email, name, org_id } or null.
export async function getSessionUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  return await verifySession(token);
}

export function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${THIRTY_DAYS}`);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

// Shared CORS + preflight for the authed endpoints. Credentialed CORS requires
// a specific origin (never "*") plus Allow-Credentials.
export function applyCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map((o) => o.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Coarse per-user daily rate limit via the events table. Returns true if OK to
// proceed, false if the user is over `limit` events of `type` in the last 24h.
export async function underDailyLimit(userId, type, limit) {
  const rows = await sql`
    SELECT count(*)::int AS n FROM events
    WHERE user_id = ${userId} AND type = ${type}
      AND created_at > now() - interval '1 day'`;
  return (rows[0]?.n || 0) < limit;
}

export async function logEvent(userId, type, meta, submissionId) {
  await sql`
    INSERT INTO events (user_id, type, meta, submission_id)
    VALUES (${userId}, ${type}, ${JSON.stringify(meta || {})}::jsonb, ${submissionId || null})`;
}

// Gate an AI endpoint (Phase 5): require a valid session cookie and enforce a
// per-user daily call cap via the events table. Returns the session payload, or
// null after having already sent the 401/429 response — callers just `return`.
export async function requireAiSession(req, res, endpoint, dailyLimit = 100) {
  const session = await getSessionUser(req);
  if (!session) { res.status(401).json({ error: "not authenticated" }); return null; }
  try {
    if (!(await underDailyLimit(session.sub, "ai_call", dailyLimit))) {
      res.status(429).json({ error: "Daily AI limit reached — please try again tomorrow." });
      return null;
    }
    await logEvent(session.sub, "ai_call", { endpoint });
  } catch (e) {
    // Fail open on the rate-limit bookkeeping if the events table is unreachable;
    // the request is still authenticated.
    console.error("rate-limit check failed:", e && e.message);
  }
  return session;
}
