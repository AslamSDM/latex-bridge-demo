# LaTeX Bridge for SuperDocs

A Visual Studio Code extension that connects a LaTeX project to the SuperDocs AI document
editor, with human-in-the-loop review before anything touches your sources.

The full loop:

1. **Upload** — pick a LaTeX project folder; the extension finds the root file (`main.tex`,
   a `% !TEX root` directive, or a single `.tex` file), zips it, and uploads it to SuperDocs
   as a document.
2. **Chat edit** — ask for a change in natural language (e.g. "expand the abstract to two
   sentences"). SuperDocs proposes section-precise edits.
3. **Human-in-the-loop review** — every proposed change is shown as a diff card; you
   accept or deny each one, with optional feedback on denied changes. Nothing is applied
   without your approval.
4. **Export** — export the edited document as `.docx` (A4, Word-native math, footnotes,
   citations preserved).
5. **Write back** — approved edits are written back into your `.tex` sources as
   byte-exact patches: only the changed paragraph ranges are replaced, everything else
   stays untouched.
6. **Co-author round trip** — import a `.docx` with tracked changes (`w:ins` / `w:del`),
   review each change, and apply the accepted ones to your `.tex` sources with the same
   byte-exact patching.

## Demo walkthrough

This repo is a self-contained demo: extension source, a prebuilt `.vsix`, and a sample
LaTeX project with the features write-back exercises (math, footnotes, citations, TikZ,
figures).

### 1. Install the extension

```bash
code --install-extension latex-bridge-0.1.0.vsix
```

### 2. Set your API key

`Cmd+Shift+P` → **LaTeX Bridge: Set API Key** → paste your `sk_...` key. It is stored in
VS Code SecretStorage, never in the repo.

### 3. Upload the sample project

`Cmd+Shift+P` → **LaTeX Bridge: Open SuperDocs Session** → **Browse…** → pick
`/samples/math-paper` (the folder that directly contains `main.tex`) → **Upload to SuperDocs**.
You should see it parsed into ~48 editable sections.

### 4. Ask for an edit

Type e.g. *"Rewrite the abstract to exactly two sentences, and add one sentence to the
introduction noting that the generating set is symmetric and contains no identity element."*
→ **Send edit (HITL review)**.

### 5. Review and approve

Every proposed change appears as a diff card (before → after, math rendered). Accept or
deny each, then **Submit decisions**. Approvals are time-sensitive: decide within seconds
of the cards appearing.

### 6. Export Word

**Export .docx (A4)** — native Word math (`oMath`), footnotes and citations preserved.

### 7. Write back to .tex

`Cmd+Shift+P` → **LaTeX Bridge: Write Approved Edits Back to .tex** → pick the project
folder → only the approved paragraph ranges change; everything else stays byte-identical.

### 8. Co-author round trip

`Cmd+Shift+P` → **LaTeX Bridge: Import Co-author Tracked Changes (.docx)** → pick a `.docx`
with tracked changes (`w:ins`/`w:del`) → select changes in the quick pick → pick the project
folder → applied to `.tex`.

> Tip: picking a parent folder of the project (e.g. the repo root) also works — the root
> `.tex` is found and the archive is re-rooted automatically.

## How to run from source

### Prerequisites

- VS Code 1.90+
- Node.js 18+ and npm
- A SuperDocs API key (`sk_...`). Get one at <https://use.superdocs.app> or via
  `POST /v1/agents/signup`.

### Setup

```bash
npm install
npm run build
```

Then run the extension host: VS Code → **Run and Debug** → **Run LaTeX Bridge (Extension Host)**
(`.vscode/launch.json` included). The prebuilt `.vsix` is regenerated with
`npx @vscode/vsce package`.

### Commands

| Command | What it does |
| --- | --- |
| `LaTeX Bridge: Open SuperDocs Session` | Opens the webview panel (project picker, chat edit, review, export). |
| `LaTeX Bridge: Upload Project to SuperDocs` | Uploads the current project folder without opening the panel. |
| `LaTeX Bridge: Export Word Document` | Exports the session document as `.docx`. |
| `LaTeX Bridge: Write Approved Edits Back to .tex` | Applies accepted edits to the `.tex` sources. |
| `LaTeX Bridge: Import Co-author Tracked Changes (.docx)` | Reads `w:ins`/`w:del` from a `.docx`, reviews, applies. |
| `LaTeX Bridge: Set API Key` / `Clear API Key` | Manages the API key (stored in VS Code SecretStorage). |

On first use you are prompted for your API key; it is stored in VS Code secret storage,
never in the repository.

### Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `latexBridge.opBudgetPerSession` | `10` | Max AI chat-edit operations per session before pausing. |
| `latexBridge.pollIntervalMs` | `2000` | Job poll interval. Approval deadlines are short, keep this low. |

### Tests

```bash
npm test        # unit tests (fixture-driven, no live API calls)
npm run typecheck
npm run build
```

(Live end-to-end smokes are gated behind `SUPERDOCS_LIVE_SMOKE=1`.)

## What SuperDocs features it uses

- **Chat editing** with `approval_mode: "ask_every_time"` — every proposed change
  (`proposed_change_batch`) waits for per-change decisions via the approve endpoint.
- **Document ingestion** — `POST /v1/uploads` (presigned upload) + `/process` with
  `parse_mode: "document"`.
- **Word export** — `POST /v1/documents/export` producing native `.docx` (oMath,
  footnotes, citations), A4 paper size.
- **REST API only** — no MCP, no web SDK; the client is a thin TypeScript wrapper around
  the SuperDocs HTTP API.

## How write-back works

- The project's `.tex` files are split into blank-line-separated segments with
  byte-accurate offsets.
- Each approved change's original HTML is converted to normalized visible text and
  matched to the best segment (ordered-subsequence score ≥ 0.7, positional fallback).
- Edits become **surgical span patches**: the changed text run inside the segment is
  located via whitespace-insensitive byte mapping and only that run is replaced.
- AI rewrites that *append* a whole new block are inserted after the aligned segment,
  so the original bytes are preserved exactly.
- Math (`data-latex`), citations (`\cite{...}`), footnotes (`\footnote{...}`) and
  section headings are serialized back to LaTeX losslessly.

## License

MIT
