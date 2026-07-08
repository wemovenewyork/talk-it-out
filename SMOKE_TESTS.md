# Talk It Out — pre-launch smoke tests

⚠️ **HUMAN GATE:** Q runs this personally on real devices before any domain flip
or distribution to workers. Green here = clear to launch.

Run on **iOS Safari** and **Android Chrome** (the target field devices).

## Core happy path
- [ ] Sign up → land in app; sign out → sign back in (session persists 30 days).
- [ ] Scan a letter-size form on a table (good light): crop hugs the paper edge,
      perspective-corrected, `?debug=1` shows `method=opencv`, < ~2s, no API call.
- [ ] Voice-fill all fields in one recording (noisy environment — play depot-noise
      audio): transcript is accurate; Spanish works with the `es` setting.
- [ ] Review → fields land on their lines (dense form, aim ≥ 80% without manual
      adjust); drag-adjust + A-/A+ fix any that don't.
- [ ] Confirm → output PDF is the **filled scan-overlay** (answers on the form),
      downloadable; matches the on-screen preview exactly.

## Auth + limits
- [ ] Wrong password → "Incorrect email or password" (not 500).
- [ ] Signed-out request to any AI endpoint → 401.
- [ ] Exceed 100 AI calls/day → friendly 429.

## The filled PDF everywhere
- [ ] Export → PDF, and Save to Google Drive: both produce the **filled** PDF
      when a scan exists; manual-entry (no scan) produces `*-summary.pdf`.
- [ ] Email a completed form (Resend) → attachment is the filled PDF.
- [ ] Amend a submission → new linked record; original retained.

## Cross-device + persistence
- [ ] Complete a scanned form on device A → sign in on device B → history shows
      it, and view/download yields the **filled scan PDF**, not a text summary.
- [ ] Clear browser storage → completed forms still there after sign-in.

## Deletion (R5)
- [ ] Delete a submission → its Blob URLs (PDF/scan/signature) return **404**.
- [ ] Close account → all submissions/events/Blobs gone; signed out.

## Offline PWA
- [ ] Install prompt works; Lighthouse "installable" passes.
- [ ] Airplane mode: app opens (cached shell); type-fill a form; complete →
      "Saved on device" + "pending sync" badge.
- [ ] Reconnect → outbox uploads, badge clears, form appears server-side.

## Security / hardening
- [ ] Response headers present: CSP, `X-Frame-Options: DENY`,
      `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- [ ] **App fully functional under the CSP** — scan (OpenCV wasm), OCR (Tesseract
      worker), voice, PDF build, fonts, Google Drive: no CSP console violations.
- [ ] Errors surface in Sentry (browser + serverless); no transcripts/field
      values/PII in Sentry payloads or server logs.
- [ ] PDF password-lock (encrypt) path produces an openable, password-protected PDF.

## Landing page
- [ ] `index.html` claims match reality (offline, the 5 named languages, security).
