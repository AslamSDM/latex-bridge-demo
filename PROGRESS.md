# PROGRESS — Task 2: LaTeX Bridge for VS Code

## 2026-08-16 16:30 — T0 spike: complete
Assumptions:
- Agent signup executes the user-approved decision; creds at ~/.superdocs/agent_credentials.json.
- Fixtures in tests/fixtures/ are the durable evidence for keyless tests.

Done (all verified live against api.superdocs.app, session t0-latex-spike):
- Signup: POST /v1/agents/signup {terms_accepted, agent_name: latex-bridge} → 201, sk key, quota free/500, whoami OK. Account 5bff7609-d0a8-4f49-befd-e6b94fa4ea65.
- Upload: pre-signed flow (POST /v1/uploads {filename, content_type, size_bytes, purpose:document} → PUT zip to gcs URL → POST /v1/uploads/{id}/process {session_id, filename, parse_mode:document, return_html:true}) → 48 chunks, version_id, warnings[{"code":"TEX_PICTURE_PLACEHOLDER","message":"A vector drawing (TikZ/PSTricks)...placeholder..."}], page_setup NULL for tex source (geometry carried into export instead).
- HTML shape: paragraphs with data-chunk-id; math as <span data-latex="..." data-type="inline-math|block-math">; footnotes <sup data-footnote-ref="1">; citations <span data-citation="Lubotzky">(Lubotzky 1994)</span>; cross-refs resolved to numbers (Figure 1, Proposition 3); TikZ → bordered placeholder <em>[Vector drawing 1 from the LaTeX source — not renderable in this import]</em>; PDF figures not imported as images (0 <img> tags).
- Chat HITL: POST /v1/chat/async {message, session_id, approval_mode:ask_every_time, model_tier:core} → job_id, status pending. Poll GET /v1/jobs/{id}.
  - Job enters status "awaiting_approval" ~8s; metadata.pending_changes[] = [{change_id, operation:edit, chunk_id, document_id:"doc_primary", old_html, new_html, ai_explanation}].
  - Proposed changes ALSO stream as intermediate_responses type "proposed_change_batch" with content = JSON-encoded string of {type:"batch_approval", batch_id, batch_total, changes[]} — second parse required (documented gotcha confirmed).
  - Approve: POST /v1/chat/{session_id}/approve {job_id, approved:true, changes:[{change_id, approved:true}]} → 200 {"status":"ok","batch_complete":true}. Top-level approved required (422 trap).
  - CRITICAL: approvals have a short validity window. First attempt approved 9 min after awaiting (job auto-advanced through 6 self-iteration batches while we were slow) → change counted as DENIED ("1 change(s) were denied") though server said ok. Immediate approval (8s) applied cleanly. Client must poll fast (2s) and approve instantly on first pending_changes sighting.
  - If approve never comes, AI self-iterates (intermediate "Revising based on your feedback..." x5) then completes with no changes. Don't rely on this as fallback.
  - AI sometimes implements "rewrite" as INSERT new paragraph chunk (chunk_id with "-1" suffix) instead of editing the body chunk (chunk 7b122131 untouched). Noted for write-back mapping.
  - Transient failures: "Instance at graph capacity — the AI run did not start within 120s" (job failed fast, progress 75). Retry after ~45s works. 503 during polls also observed (transient).
  - First chat in a fresh session is slow (documented warm-up); later turns faster.
- Export: POST /v1/documents/export {session_id, format:docx} → 42.7KB docx: 68 native <m:oMath> elements, 1 w:footnoteReference, resolved citations as text, sectPr Letter 12240x15840 by default. With options {paper_size:A4} → 11909x16834 (A4) — geometry pass-through works via options. X-Export-Warnings header NOT present on clean export (only set when warnings exist).
- Budget: whoami quota still shows 0 used (counter lags); treat chat edits as ops.

Next:
- T1: extension scaffold. Note approval-fast-poll design (2s) and deny-on-slow behavior in client docs.

## 2026-08-16 16:45 — T1: scaffold started
- Repo /Users/aslam/tempy/latex-bridge git init'd; samples/math-paper project compiles clean (pdflatex x2 + bibtex).
- Node v24.10.0, npm 11.6.1 available.
- Next: package.json + esbuild + extension host + API client core.

## 2026-08-16 23:30 — T1: scaffold COMPLETE (build + typecheck + tests green)
Assumptions:
- UI decides approval routing; BridgeSession pauses on awaiting_approval until submitDecisions arrives (matches T0 HITL finding: poll fast, approve instantly).
- Export uses explicit paper_size A4 (T0: geometry NOT honored by default; page_setup NULL for tex).

Done (verified: npm run typecheck clean, npm run build clean, npm test 17/17 pass):
- src/keychain.ts — API key in VS Code SecretStorage (getKey/setKey/clearKey, initKeyStorage(context.secrets)).
- src/webview/panel.ts — webviewPanel(context): HTML shell + CSS (dist/media/app.css via esbuild copy), onDidReceiveMessage routing to PanelHandlers, post()/emit() bridge; submitDecisions message → handlers.onSubmitDecisions.
- src/webview/app.tsx + app.css — React UI: phase machine (ready/uploading/uploaded/editing/awaiting/completed/exporting/error), project picker, session create, edit prompt, review cards (accept/deny per change with diff old/new via innerHTML), decisions submit, export button, ingest/export warnings panels, error display. Message protocol: openProject/createSession/requestEdit/exportDocx/submitDecisions (vscode.postMessage) + ready/sessionEvent/editCompleted/exportCompleted/error (window message).
- src/extension.ts — rewired: makeClient async via getKey (prompts + stores key), panel.ready(client, handlers), session events → panel.emit("sessionEvent", e), submitDecisions → activeSession.submitDecisions, export writes via showSaveDialog; commands open/uploadProject/exportDocx/setKey/clearKey registered.
- src/core/session.ts — pendingApproval pause: pollForApprovals holds on Promise until submitDecisions resolves; decisions mapped to API shape {change_id, approved, feedback}; "already pending" guard; emits awaiting_approval/approved/denied. Removed auto-approve approveHandler.
- src/core/types.ts — ProposedChangeBatch.type now "batch_approval" | "single_approval" (fixture shows single_approval).
- src/core/client.ts — fixed chatAsync arg order (was POST,"path" swapped); putBytes Uint8Array→BodyInit cast.
- src/core/zip.ts — removed ".pdf" from IGNORED_EXTENSIONS (figures/spectrum.pdf must ship in zip; only build artifacts excluded).
- esbuild.mjs — watch conditionalized (esbuild rejects watch:false); copies app.css → dist/media.
- tsconfig — lib adds DOM (webview app.tsx).
- tests: client.test.ts (parseExportWarnings, extractBatches, upload flow with mock bucket PUT, ApiError 422, HITL poll with approve, export warnings header), zip.test.ts (findLaTeXRoot 5 cases, buildProjectZip skips artifacts incl .git), session.test.ts (UI-decisions flow — poller returns awaiting then completed; budget exhaustion throws). Fixtures job-awaiting/job-done drive poll tests; session tests use real fixture job_id (54476aa3-...) for approve assertion.

Gotchas fixed during test run:
- mock fetch must return different job on each poll (first awaiting, then completed).
- bucket PUT path is /up1 (not /v1/...).
- esbuild "watch" invalid when false.

Next:
- T2: review UI refinement + write-back mapping (T3): chunk↔.tex provenance. Requires mapping data-chunk-id → source range; plan: fetch document HTML (return_html:true) at upload, align chunk order with pdftotext/pdf or latex source order, then range-patch .tex. Track-changes import (w:ins/w:del) → own review list → apply → re-export.

## 2026-08-16 23:45 — T3 write-back: COMPLETE (30/30 tests, typecheck clean, build clean)
Assumptions:
- Write-back maps approved changes to .tex via content alignment (chunk visible text → best-matching source paragraph segment, >= 70% ordered-subsequence score), NOT chunk-id provenance (server chunk ids are opaque). Footnote bodies looked up per aligned file by scanning \\footnote{...} in source.
- AI "rewrite" changes that only ADD a paragraph are treated as appends: new_html startsWith old_html (normalized) → insert remainder AFTER aligned segment end. Verified against real job fixture (insert after abstract block, tail bytes identical).
- htmlToLatex: math lossless (data-latex), citations → \cite{key list}, footnote refs → \footnote{body}, h1/h2/h3 → \section/.../..., rendered section numbers stripped (section{3 Main Results} → \section{Main Results}).
- visibleWords drops data-latex spans entirely (inner render noise) so alignment keys on prose only.

Done:
- src/core/writeback.ts — segmentize (blank-line paragraph segments, splice-safe offsets, doc-covering test), normalize (strips \cmds, braces, $), htmlToLatex (tag walker, entities decoded, data-latex/citation/footnote handling), alignChunkToSegments + subsequenceScore.
- src/core/align.ts — buildAlignment (per-file segment index, positional fallback for empty-text chunks), planPatches (edit vs insert-append detection), applyPatches (per-file, ascending start order).
- src/core/writeback-cli.ts — writeBackToProject(projectDir, rootFile, changes): reads all .tex, segments, aligns, plans, applies → outcome {files: Map<rel, content>, applied[], unresolved[]}.
- src/extension.ts — "latex-bridge.writeBack" command: session.approvedChanges → folder picker → writeBackToProject → writes patched files to disk (VS Code fs), warning message on unresolved.
- src/core/session.ts — appliedChanges[] (only approved, from the decision subset); emitted event carries approvedIds.
- package.json — writeBack command registered.
- tests/writeback.test.ts — 13 tests: segmentize offsets/coverage, math/citation/footnote/heading conversion, alignment hit + miss, fixture-driven append detection, byte-identical untouched tail, visibleWords, subsequenceScore, normalize. tests/fixtures/sample-abstract.tex added.

Gotchas fixed:
- Tag-walker last-index advance bug dumped raw HTML into output (double content) — fixed by advancing last before branch continues.
- Function-body corruption from a bad edit (walk nested under htmlToLatex with out in TDZ) — rewritten cleanly.
- Real fixture content type is "single_approval" (not batch_approval) — accept both.
- Alignment debug via vitest scratch test (node strip-types can't resolve extensionless imports).

Next:
- T3 remainder: track-changes import (parse docx w:ins/w:del → own review list → apply approved to .tex). Approach: unzip word/document.xml, walk paragraphs, split runs by w:ins/w:del, map to segments same as write-back, produce Change-like entries. Then README + live smoke + PR.

## 2026-08-17 00:05 — T3 track-changes import: COMPLETE (36/36 tests, typecheck + build clean)
Assumptions:
- Co-author docx contains w:ins/w:del runs; per-paragraph extraction produces one review item per changed paragraph with old/new renderings.
- Word deletions live ONLY in w:del (delText), so old rendering = orig + del, new rendering = orig + ins.
- Reuse write-back pipeline (alignment + planPatches) for tracked changes by converting TrackChange → Change with escaped text paragraphs.
- Span edits should be surgical: only the changed text run replaced, everything else byte-identical. The generic replace-segment fallback exists when exact span match fails.
- AI append heuristic must NOT fire for co-author mid-paragraph inserts: gated on added block tags (p/h1-6/blockquote/ul/ol/li/pre) in new_html vs old_html.

Done:
- src/core/trackchanges.ts — parseDocxTrackChanges(docxBytes): unzip word/document.xml, per-paragraph extractRuns (single ordered scan of w:ins/w:del/w:r via combined regex), collectText (w:t + w:delText), render(old/new), author/date/id metadata, toChange() → Change.
- src/core/align.ts — planSpanPatch: whitespace-collapse byte-mapped substring match (collapseWithMap) → replaces ONLY the changed run inside the segment; falls back to whole-segment replace. blockCount() gates the append-after-AI-rewrite heuristic.
- src/extension.ts — latex-bridge.importTrackChanges command: open docx → parse → showQuickPick (multi-select, detail shows old → new) → pick project folder → writeBackToProject → writes patched files + summary warning on unresolved.
- package.json — importTrackChanges command registered.
- tests/trackchanges.test.ts — 5 tests: ins/del extraction with author+renderings, no-changes → [], real export fixture parses, co-author insertion applied, span-edit preserves untouched bytes (before/after regions + tail identity).

Gotchas fixed:
- extractRuns two-phase ins/del reorder produced wrong old/new when both present — rewritten as single combined-regex ordered scan; del meta (id/author/date) now captured too (was ins-only).
- planPatches classified co-author mid-paragraph insert as AI append (newNorm.startsWith(oldNorm)) → stray \n\n fragment. Now append requires added block tags AND prefix relation.
- Realistic Word deletion fixtures: deleted text only in w:del (delText), live runs are the kept text — earlier test duplicated text into a live run, which also broke alignment.

## 2026-08-17 12:35 — T4: live smoke COMPLETE (both E2E tests green)
Done (verified live, account 5bff7609; `SUPERDOCS_LIVE_SMOKE=1 npx vitest run tests/live-smoke.test.ts` → 2/2 pass):
- Smoke 1 (upload → chat edit → HITL approve → export A4 docx → write-back → compiles): PASS. Patched sections/main.tex abstract env → `\textbf{Abstract. …}`; 2/2 changes applied.
- Smoke 2 (co-author tracked changes: inject w:ins/w:del into exported docx → import → write-back → compiles): PASS. `{found:1, applied:1, unresolved:0}`.

Gotchas fixed during T4:
- writeback-cli returned applyPatches' `unresolved` ([] hardcoded) instead of planPatches' — alignment failures silently swallowed. Now returns planPatches' unresolved list.
- collectText dropped `<w:br/>`/`<w:tab/>` → runs split mid-sentence concatenated without whitespace ("Cayley"+"graphs" → "Cayleygraphs") → nothing aligned. Rewritten as single ordered regex over w:t/w:delText/w:br/w:tab, br/tab → space. Regression test added (6 trackchanges tests).
- panel.ts stray `<style>${cspSource}</style>` → proper CSP meta tag (style-src cspSource + unsafe-inline, img-src https: data:).
- .gitignore added (node_modules/, dist/, extension/, data/, *.vsix, tex build artifacts + !figures/spectrum.pdf).

Next:
- T4 remainder: verify README per CONTRIBUTING.md, fork superdocsapp/superdocs-builds → extensions/AslamSDM/latex-bridge/ → PR with public name + 1–2 sentence description.

## 2026-08-17 13:00 — T4 COMPLETE: PR #54 opened
Done:
- Forked superdocsapp/superdocs-builds → AslamSDM fork; branch `latex-bridge`; folder `extensions/AslamSDM/latex-bridge/` with src, tests, samples, README, package files (40 files; no node_modules/dist/secrets).
- Scrub check: no API keys; live-account user_id in fixtures replaced with zero UUID.
- Fork copy independently verified: npm install + 36/36 tests + typecheck green.
- PR https://github.com/superdocsapp/superdocs-builds/pull/54 — state OPEN, MERGEABLE, no CI checks (repo has none). Body: "Aslam SDM" + 2-sentence description per CONTRIBUTING.md.

Remaining (Task 2 fully done):
- Nothing in-repo. Optional: manual VS Code UI walkthrough (F5 extension host) — the API path is covered by the two live smokes; only the webview UI is not E2E-tested (it renders review cards from the same approved-changes payloads the smokes exercise).
- Task 1 (/Users/aslam/tempy/superdocs) still deferred per user directive.

## 2026-08-20 10:00 — T5: webview UI walkthrough (user asked to "do it as well")
Assumptions:
- "Walkthrough" = close the UI gap with automation, not a one-off manual click-through: (a) jsdom rendering tests for app.tsx phase machine using real fixtures, (b) .vscode/launch.json so F5 works, (c) a real extension-host boot test via @vscode/test-electron asserting all 6 latex-bridge.* commands register.
- jsdom (30.x) to be added as devDependency; vitest per-file `// @vitest-environment jsdom` pragma so existing node-env tests are untouched.
- React 18.3 exports `act` from "react" — no @testing-library needed; assert via plain DOM (textContent/querySelector).
- app.tsx calls `acquireVsCodeApi()` and `createRoot().render()` at module scope → test must stub global + create #root before dynamic import.

Next:
- Write tests/web-ui.test.ts (jsdom): ready → projectOpened → sessionCreated (ingest warnings) → awaiting (review cards with diff HTML incl. data-latex math) → accept/deny → submitDecisions postMessage shape → editCompleted → exportCompleted → error.
- npm i -D jsdom; run full suite (expect 36 + N).
- Add .vscode/launch.json (extensionHost debug) for F5.
- Add @vscode/test-electron boot test: extension host activates, 6 commands registered.
- Record results, update README test section if needed.
