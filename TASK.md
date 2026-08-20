# Task 2 — LaTeX Bridge for VS Code (SuperDocs)

## Goal
A **full TypeScript VS Code extension** that takes a LaTeX project (Overleaf shape:
root `.tex` + `\input` chapters + figures + `.bib` + custom class) and makes it editable
through SuperDocs: native-format upload → chat with HITL review → Word export → **write
approved edits back into the `.tex` source files range-by-range** (untouched parts byte-identical),
plus a **co-author tracked-changes round trip** (import `w:ins`/`w:del` into our own review list).

Final deliverable: PR to `superdocsapp/superdocs-builds` at `extensions/AslamSDM/latex-bridge/`
(with README per CONTRIBUTING.md rules). Dev location: `/Users/aslam/tempy/latex-bridge`.

## Acceptance criteria
1. Fresh install → paste API key → pick project dir → upload as SuperDocs document (pre-signed flow).
2. Chat instruction → `approval_mode=ask_every_time` → poll → HITL pending changes rendered as
   review cards (before/after diff, math rendered) → approve per-change and batch (top-level `approved`).
3. Export `.docx` with native Word math, real footnotes, resolved citations, page geometry honored;
   `X-Export-Warnings` header surfaced (base64 JSON), ingest warnings panel.
4. Apply-back: approved edits patch the `.tex` files; untouched source spans byte-identical (asserted by tests).
5. Track-changes import: co-author `.docx` → review list → apply approved → `.tex`.
6. Budget guards (small-sample mode, op-budget, quota), no secrets in repo, keyless tests green.

## Conventions
- TypeScript throughout; extension via esbuild; React webview (mirrors prosemirror-superdocs-demo patterns).
- Keyless tests: recorded fixtures from T0 spike (replay), synthetic local projects.
- SuperDocs REST contract (no MCP for the extension; REST = 4-call contract):
  - upload: `POST /v1/uploads` → PUT pre-signed → `POST /v1/uploads/{id}/process`
    (parse_mode=document, return_html=false by default) — sync; response has session_id, chunks_count,
    version_id, page_setup, warnings[].
  - chat: `POST /v1/chat/async` approval_mode=ask_every_time → poll `GET /v1/jobs/{id}`;
    proposed-change payloads need a second JSON parse; branch on awaiting_kind.
  - approve: `POST /v1/chat/{session_id}/approve`, top-level `approved` required.
  - export: `POST /v1/documents/export` format=docx; read X-Export-Warnings header.
- Budget: free tier 500 ops/mo; chat edits are the currency; uploads/parsing/exports free.
- No comments in code unless asked; no emojis.

## Definition of done
Keyless tests pass, typecheck + lint clean, live smoke run (~5–10 ops) recorded in PROGRESS,
README + PR to superdocs-builds, TASK.md/PROGRESS.md updated throughout.

## Rules of engagement
Build autonomously milestone by milestone; verify each with the user at T0, T2, T4 boundaries
if anything surprising surfaces; report budget spent at each live step.
