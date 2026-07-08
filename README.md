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
| `vendor/opencv.js`, `vendor/jscanify.min.js` | Vendored, pinned (jscanify 1.4.2) client-side document scanner. Served same-origin, lazy-loaded on first scan. |
| `vendor/tesseract/` | Vendored, pinned Tesseract.js 5.1.1 + core 5.1.1 (LSTM builds) + fast `eng.traineddata.gz`. Client-side OCR for field label-snapping. |
| `vercel.json` | Vercel config (headers only). |

## Document scanning (Phase 2)

Document-boundary detection runs **client-side** with vendored OpenCV.js + jscanify — deterministic, instant, free, and offline-capable. The pipeline in `handleScanButton()` is a fallback chain:

1. **Primary — jscanify/OpenCV** on the full-res frame. A detected quad is validated (`isPlausibleQuad`: area > 20% of frame, convex, aspect 0.5–2.0). Zero API calls in the happy path.
2. **Fallback 1 — `/api/scanDocument`** (Claude) if OpenCV finds no plausible quad and the device is online.
3. **Fallback 2 — full frame**, no perspective warp; the raw capture is kept for manual crop/adjust (Phase 3).

The existing `computeHomography` / `perspectiveCorrect` math is reused unchanged — only the input corners changed. The `expandCorners` fudge factor is gone from the primary path (it only compensated for Claude's inset bias) and is applied solely in the Claude fallback. Add `?debug=1` to the URL to draw the detected quad on the live frame.

OpenCV.js (~9MB, inlined wasm) is lazy-loaded when the scanner opens and cached via `vercel.json` (`max-age=86400, stale-while-revalidate` — no `immutable`).

## Field placement (Phase 3)

Claude's `extractFields` stays the semantic brain (what fields exist, their labels, and `orientation: inline|below`); vendored **Tesseract.js** provides pixel truth (where labels actually are). After extraction, `runOCRWords` reads word boxes from the scanned image and `snapFieldsToOCR` fuzzy-matches each field's `labelText` to its OCR label (token-overlap ≥ 0.6), then recomputes the input area — to the **right** of the label for inline fields, **below** it otherwise. Fields keep Claude's coords when there's no confident match, tagged `anchor: "ocr" | "claude"`. OCR is best-effort with a 20s timeout; failure silently leaves Claude's placement.

**Manual adjust** — the review screen has an *Adjust placement* toggle: tap a field to select, drag to move, `A-`/`A+` to resize the font, `Reset` to restore. Adjusted coords/scale persist on the field so the exported PDF matches the preview. A shared `drawFieldText` fitter (shrink-to-fit min 7pt + wrap + vertical centre) is used by **both** the on-screen overlay and the PDF fill, so they always agree.

## Interim app gate (`APP_SHARED_SECRET`)

Active as of Phase 3: `app.html` sends `x-tio-app: <APP_SHARED_SECRET const>` on every AI call, and each endpoint rejects mismatches with 401 **when** the `APP_SHARED_SECRET` env var is set in Vercel. The const in `app.html` and the Vercel env var must hold the **same** value. This is obfuscation, not security (the value ships in the client) — superseded by the Phase 5 session cookie.

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
