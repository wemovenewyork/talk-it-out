# Talk It Out

Scan any paper form, speak your answers, and get a completed official PDF back. Built for a worker in the field — mid-shift, on a phone, often in a noisy or low-connectivity environment. The app is a single-file front end (`app.html`) backed by a handful of Vercel serverless functions in `api/` that proxy Anthropic Claude for document scanning, field extraction, and voice-to-field mapping.

## Layout

| Path | Purpose |
|------|---------|
| `app.html` | The entire app — single-file, ~5,700 lines. Keep it single-file. |
| `index.html` | Marketing / landing page. |
| `privacy.html`, `terms.html` | Legal pages. |
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
| `APP_SHARED_SECRET` | Phase 1 | Optional interim app gate. When set, all AI endpoints require an `x-tio-app` header matching this value, and the same value must be placed in `app.html`'s `APP_SHARED_SECRET` const. **Obfuscation, not security** — real gate is the Phase 5 session cookie. Leave unset to disable. |
| `EXTRACT_FORM_FIELDS_MODEL` | Phase 1 | Optional model override for `extractFormFields` (default `claude-sonnet-4-6`). |
| `REWRITE_MODEL` | Phase 1 | Optional model override for `rewrite` (default `claude-sonnet-4-6`). |

### API endpoints

| Endpoint | Input | Purpose |
|----------|-------|---------|
| `POST /api/extractFormFields` | `{ images: [base64…], mimeType }` or `{ text }` | Extract form fields from scanned image(s) or document text. Model/prompt/limits hardcoded server-side. Returns `{ fields: [...] }` or `{ fields: [], error }`. |
| `POST /api/rewrite` | `{ transcript, tone }` (`tone` ∈ professional\|concise\|detailed\|plain) | Rewrite a spoken account into professional documentation. Returns `{ text }`. |
| `POST /api/scanDocument` | `{ imageData, mimeType, imageWidth, imageHeight }` | Claude document-corner detection (Phase 2: fallback-only). |
| `POST /api/extractFields` | `{ imageData, mimeType }` | Alt field extraction (id/label + 0–1 fraction coords). |
| `POST /api/mapVoiceToFields` | `{ transcript, fields }` | Map a transcript onto extracted fields. |

> The generic `/api/chat` proxy was **removed in Phase 1** — all AI features now go through the purpose-built endpoints above, each of which hardcodes its model, system prompt, and token limits server-side. There is no generic Anthropic pass-through in the deployment.

## CORS

All API endpoints reflect the request `Origin` only when it appears in the comma-separated `ALLOWED_ORIGINS` env var. Requests with no `Origin` header (same-origin) are allowed. Adding a new deployment domain is a one-line env change — no code edits.
