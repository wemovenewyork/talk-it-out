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

## Output convergence — every path yields the filled scan (WO2)
- [ ] **A. Field-by-field parity:** camera-scan a printed form → answer via the
      one-at-a-time voice flow → review shows answers drawn **on the form image**
      (stats strip above it) → Confirm → the output/downloaded/emailed/history PDF
      **page 1 is the scanned form with answers on the lines**; typed summary
      appended after.
- [ ] **B. Voice-all parity:** same filled-scan result via the speak-it-all path.
- [ ] **C. Draft resume:** scan → answer half → save draft → close app → resume →
      finish → same filled-scan artifact (canvas rehydrated from the draft).
- [ ] **D. No-canvas fallback:** manual entry (no scan) → typed "Summary PDF",
      correctly labeled; `submitApproval` reached without a console routing warning.
- [ ] **E. Second device:** history on another device serves the filled-scan PDF
      for A–C.

## Upload as first-class input (WO2b)
- [ ] **Upload = camera parity:** upload the SAME printed form as a **PDF** →
      identical filled-scan artifact as the camera path (extraction → snap →
      voice → overlay → filled page-1 PDF). Uploaded **image** skips edge
      detection (already flat) and yields the same.
- [ ] **pdf.js under CSP + offline:** first PDF upload works with **no CSP console
      violation** (vendored same-origin worker); works in airplane mode
      (SW-precached). Multi-page PDF fills **page 1** and shows the
      "filling page 1 of N" notice (no silent drop).

## Landing page
- [ ] `index.html` claims match reality (offline, the 5 named languages, security).
