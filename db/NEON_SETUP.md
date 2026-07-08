# Neon setup for Phase 5 — exact steps

These are ready to run the moment the Neon project exists and you (Q) hand over access.
**⚠️ Connection-string safety:** any command whose output may contain a connection
string is redirected to a file or piped — never echoed to the terminal/log.

## 1. Create the project (dashboard or CLI)

Dashboard: create a new Neon project named **`talk-it-out`** (its own project, *not* a branch
of another product's DB). Copy the pooled connection string.

Or via CLI (auth first with `neonctl auth`):

```bash
# Create project; capture the connection string to a git-ignored file, never stdout.
neonctl projects create --name talk-it-out --output json > /tmp/neon_taio.json 2>/dev/null
# Extract the pooled DATABASE_URL WITHOUT printing it:
python3 -c "import json;d=json.load(open('/tmp/neon_taio.json'));print(d['connection_uris'][0]['connection_uri'])" > /tmp/neon_dburl.txt
# (Do not cat /tmp/neon_dburl.txt to the terminal.)
```

## 2. Apply the schema

```bash
# Uses the URL from the file; does not expose it in argv where avoidable.
psql "$(cat /tmp/neon_dburl.txt)" -f db/001_init.sql
```

Verify (safe — prints table names only):

```bash
psql "$(cat /tmp/neon_dburl.txt)" -c "\dt"
# expect: orgs, users, submissions, events, password_resets
```

## 3. Set env vars in Vercel (Production scope) — via dashboard or REST API, NOT `vercel env add`

- `DATABASE_URL` = the pooled Neon connection string (from `/tmp/neon_dburl.txt`)
- `JWT_SECRET` = 32+ random bytes, e.g. `openssl rand -hex 32`
- `BLOB_READ_WRITE_TOKEN` = from Vercel Blob store (see below)
- `RESEND_API_KEY` = from Resend

## 4. Vercel Blob store

Create a Blob store for the project (Vercel dashboard → Storage → Blob → Create),
connect it to `talk-it-out`; Vercel injects `BLOB_READ_WRITE_TOKEN` automatically
once connected. Confirm it appears in Production env.

## 5. Cleanup

```bash
rm -f /tmp/neon_taio.json /tmp/neon_dburl.txt
```
