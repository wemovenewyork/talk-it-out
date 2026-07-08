# Talk It Out

Scan any paper form, speak your answers, and get a completed official PDF back. Built for a worker in the field — mid-shift, on a phone, often in a noisy or low-connectivity environment. The app is a single-file front end (`app.html`) backed by a handful of Vercel serverless functions in `api/` that proxy Anthropic Claude for document scanning, field extraction, and voice-to-field mapping.

## Layout

| Path | Purpose |
|------|---------|
| `app.html` | The entire app — single-file, ~5,700 lines. Keep it single-file. |
| `index.html` | Marketing / landing page. |
| `privacy.html`, `terms.html` | Legal pages. |
| `api/chat.js` | Generic Anthropic proxy (being hardened / retired — see work order Phase 1). |
| `api/scanDocument.js` | Claude document-corner detection (fallback-only as of Phase 2). |
| `api/extractFields.js` | Claude form-field extraction from a scanned image. |
| `api/mapVoiceToFields.js` | Maps a voice transcript onto extracted form fields. |
| `vercel.json` | Vercel function config. |

## Local development

```bash
npm i -g vercel      # once
vercel dev           # serves app.html + api/* locally with env vars
```

Then open the printed localhost URL. Set the env vars below in a local `.env` (git-ignored) or via `vercel env pull`.

> **Footgun:** the `vercel env add` CLI has a stdin-drop bug in non-interactive mode — it can silently store empty values. Set env vars via the Vercel dashboard or REST API, not the CLI prompt.

## Environment variables

Set via the Vercel dashboard or REST API. Grows each phase of the production-hardening work order.

| Var | Since | Notes |
|-----|-------|-------|
| `ANTHROPIC_API_KEY` | — | Claude API key used by all `api/*` endpoints. |
| `ALLOWED_ORIGINS` | Phase 0 | Comma-separated CORS allowlist, e.g. `https://talk-it-out-two.vercel.app`. Same-origin requests (no `Origin` header) are always allowed. |
| `EXTRACT_FIELDS_MODEL` | Phase 0 | Optional model override for `extractFields` (default `claude-sonnet-4-6`). |
| `MAP_VOICE_MODEL` | Phase 0 | Optional model override for `mapVoiceToFields` (default `claude-sonnet-4-6`). |
| `SCAN_DOCUMENT_MODEL` | Phase 0 | Optional model override for `scanDocument` (default `claude-sonnet-4-20250514`). |

## CORS

All API endpoints reflect the request `Origin` only when it appears in the comma-separated `ALLOWED_ORIGINS` env var. Requests with no `Origin` header (same-origin) are allowed. Adding a new deployment domain is a one-line env change — no code edits.
