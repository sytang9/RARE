# RARE Progress Log

Reverse-chronological milestone log. One entry per **milestone**, not per commit. See `git log` for per-commit detail.

A milestone is a phase boundary, a major user-visible feature, a verification-gate pass, or an architectural pivot.

---

## 2026-05-17 — Web app mode: Express server + Docker Compose, no display required

**What shipped**
- `server.ts`: Express 5 backend that runs ALL business logic (ingest, chat, lint, vault, LLM). API key and vault path from env vars, never exposed to browser.
- `scripts/raw-loader.mjs` + `scripts/raw-loader-impl.mjs`: Node.js ESM hooks that handle Vite's `?raw` imports when running with `tsx`, so the same TypeScript modules work both in Vite (browser) and the Express server (Node.js).
- `Dockerfile` + `docker-compose.yml`: single `docker compose up` deploys the app. No X11/display required.
- `.env.example`: `ANTHROPIC_API_KEY` + `VAULT_PATH`.
- Views and stores refactored to pure fetch calls (`/api/ingest/url`, `/api/ingest/path`, `/api/chat`, `/api/settings`, `/api/lint`). All LLM/vault code removed from browser bundle.
- `src/sources/url.ts`: `htmlToMarkdown` made async, JSDOM path for Node.js server.
- `src/sources/pdf.ts`: Node.js pdf-parse path added alongside Tauri invoke path.
- `App.tsx`: removed server-side imports (lint scheduler + settings); lint-on-open now fires from server startup.
- `jsdom` moved from devDependencies to dependencies.
- 50/50 Vitest tests still passing after all changes.
- `npm run server` launches the backend; `npm run build:web` builds only the Vite frontend.

**Why:** Shared server (shanyuan) has no X11 display; teammate access requires single-command install on any machine.

**Key decisions**
- `module.register()` (new Node.js ESM hooks API) required for the raw-loader to coexist with tsx's loader hooks.
- `QueueBackend` synchronous interface already matched `better-sqlite3` — no adapter needed.
- Lint on startup errors are non-fatal (swallowed with console.warn).

**What's next**
- Smoke test: `docker compose up`, paste 10 URLs + 2 PDFs, verify wiki structure.
- Recovery test: kill mid-ingest, verify queue resumes.
- 20-question eval.
- Merge to main.

---

## 2026-05-17 — Production build green: binary + .deb package built

**What shipped**
- Fixed Vite build: replaced all `node:fs/path/url` in frontend with `src/lib/fs.ts` (Tauri-aware wrappers) and `src/lib/path.ts` (sync helpers). Prompts switched to `?raw` Vite imports.
- Added `list_dir` Rust command in `lib.rs` for `readdir` support.
- Docker image `rare-dev` (Ubuntu 22.04 + Node 20 + Rust + all webkit2gtk/gtk3 deps) for building on shared server without sudo.
- Binary: `src-tauri/target/release/rare` (22 MB). Package: `RARE_0.1.0_amd64.deb` (7.8 MB).
- `npm rebuild better-sqlite3` needed inside Docker (native module ABI mismatch between host Node version and Docker Node 20).
- `isTauri` detection uses `window.__TAURI_INTERNALS__` — not `typeof window`, since Vitest/JSDOM has `window` but not `__TAURI_INTERNALS__`.
- 50/50 Vitest tests still passing after refactor.

**What's next**
- Smoke test: run app (needs X11 or VNC on a machine with a display).
- Recovery test, 20-question eval, then merge to main.

---

## 2026-05-17 — v1 implementation complete: all 22 tasks shipped

**What shipped**
- Phase 0 (scaffold): Tauri+React+Vite+TS init, sqlite migrations, Anthropic client wrapper.
- Phase 1 (vault + ingest happy path): frontmatter, slugs, wikilinks, page read/write, index/log/overview maintenance, URL→markdown, two-step CoT analyze→generate, end-to-end ingest orchestration.
- Phase 2 (queue + chat + PDF): sqlite-backed queue with retry/crash-recovery, background worker, SHA256 dedup + analyze cache, PDF extraction (Rust `pdf-extract`), pure-LLM `findRelevantPages` (swappable interface), chat `answer` with citations, paste/chat/settings UI, cost telemetry in Settings.
- Phase 3 (lint + eval + polish): orphan/dead-link detection, LLM lint pass (`record_lint_findings` tool), run-on-open scheduler, default `purpose.md`/`schema.md` templates, 20-question eval scaffold (gated by `RARE_EVAL=1`), Obsidian config auto-generation.

**Stats**
- 50 Vitest tests passing (1 skipped — DB connect, needs Tauri runtime)
- `npx tsc --noEmit` clean
- 22 conventional-commit messages, one per task
- Worktree: `worktree-v1-implementation`, remote `https://github.com/sytang9/rare.git`

**What's next**
- Smoke test: paste 10 URLs + 2 PDFs, verify wiki structure in Obsidian.
- Recovery test: kill mid-ingest, verify queue resumes.
- 20-question eval: populate `eval/cases.json` and run `RARE_EVAL=1 npx vitest run eval/`.
- Cargo install needed to run Rust tests (`cargo test pdf_test`).

---

## 2026-05-16 — Project bootstrapped: spec, architecture, and plan in place

**What shipped**
- Brainstormed scope and locked v1 decisions (spec at `~/.claude/plans/grill-me-i-want-to-wiggly-toast.md`).
- Wrote `docs/ARCHITECTURE.md` — subsystems, data layout, interfaces, data flows.
- Wrote `docs/superpowers/plans/2026-05-16-rare-v1.md` — 4-phase TDD plan, 22 tasks.
- Established conventions in `CLAUDE.md` — auto-commit per task, milestone log, GPL constraint, test architecture.
- Pulled `nashsu/llm_wiki` into `ref/` for inspiration (GPL v3 — do not copy from).

**What's next**
- Phase 0 — Scaffold (Tasks 0.1–0.3): Tauri+React+Vite+TS init, sqlite migration, Anthropic wrapper.

**Decisions locked**
- Personal-first; team mode deferred to v2.
- Anthropic only (Haiku ingest/lint, Sonnet chat). No multi-provider abstraction.
- Pure-LLM retrieval over `index.md`; vector/BM25 gated by eval set.
- Markdown on disk = source of truth; sqlite only for queue/settings/chats.
- No real cron in v1 — run-on-open lint with manual button.
- Tauri+React+Vite+TS+shadcn+Zustand. Clean-room implementation (no GPL copy from `ref/llm_wiki/`).

**Open risks**
- Pure-LLM retrieval ceiling at scale — measured by 20-question eval set at 10/50/100 sources.
- Cost burn invisible if telemetry is forgotten — Task 2.8 makes it surfaced in Settings.
- Prompt regression silent — mitigated by snapshot tests on `prompts/*.md`.
