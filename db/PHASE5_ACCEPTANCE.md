# Phase 5 acceptance tests (auth + server persistence)

Run against a preview/prod deploy with `DATABASE_URL`, `JWT_SECRET`,
`BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY` set. All AI endpoints require a session.

## Auth
- [ ] Sign up on device A → account created, session cookie set, lands in app.
- [ ] Sign out → AI calls 401; sign back in → works.
- [ ] Wrong password → "Incorrect email or password" (no email enumeration).
- [ ] Forgot password → reset email arrives (Resend); reset link sets a new password; link is single-use and expires in 1h.
- [ ] Signed-out `curl` to any AI endpoint (`extractFormFields`, `rewrite`, `transcribe`, `extractFields`, `mapVoiceToFields`, `scanDocument`) → 401.
- [ ] Over 100 AI calls/day for one user → 429.

## Cross-device history + the filled PDF (work-order amendment)
- [ ] Complete a **scanned** form on device A (answers drawn on the form image).
- [ ] Sign in on device B → the form appears in history, and view/download/export yields the **filled scan-overlay PDF** (answers on the real form), **not** a typed text summary.
- [ ] On the output screen, "Export → PDF" and "Save to Google Drive" produce the filled PDF when a scan exists; only a manual-entry form (no scan) produces a file named `*-summary.pdf`.
- [ ] Email a completed form → the Resend attachment is the stored filled PDF (from Blob), not a rebuild.

## Deletion is true (R5)
- [ ] Note a completed submission's `pdf_blob_url` / `original_scan_blob_url` / `signature_blob_url`.
- [ ] Delete the submission in-app → **each of those Blob URLs returns 404** and the row is gone.
- [ ] Close account → all of that user's submissions, events, and Blob artifacts are removed; session cookie cleared.

## Storage durability
- [ ] Complete a form, then clear browser storage → the completed form is still retrievable after signing back in (served from the server, with its filled PDF).

## Privacy copy (Q sign-off gate)
- [ ] `screen-privacy-notice`, `privacy.html`, `terms.html` reflect R1–R5 accurately (org code grants no third-party access; infra-level encryption wording; softened AI-provider wording; retention "until you delete or close account"; deletion true).
