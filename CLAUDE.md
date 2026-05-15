# RARE — Claude Code Guide

This file orients Claude Code on the RARE project. Read this first whenever a new session opens here.

## What this project is

**RARE** (Read And Remember Everything) — a personal knowledge system inspired by Andrej Karpathy's [llm-wiki pattern](ref/llm-wiki.md). A Tauri desktop app where the user pastes URLs, PDFs, and markdown; Anthropic Claude (Haiku for ingest/lint, Sonnet for chat) builds and maintains a self-organizing markdown wiki that doubles as an Obsidian vault.

**Not RAG.** v1 uses pure-LLM retrieval over a hand-maintained `index.md`. Vector/BM25 search is gated by a retrieval-quality eval and can be added later behind the swappable `findRelevantPages` interface.

## Canonical documents (read in this order)

1. **`docs/ARCHITECTURE.md`** — subsystems, data layout, key TypeScript interfaces, data flows, file map. The "what exists and where" reference.
2. **`docs/superpowers/plans/2026-05-16-rare-v1.md`** — the v1 implementation plan, 22 TDD tasks across 4 phases. The "how to build it" reference.
3. **`ref/llm-wiki.md`** — Karpathy's original pattern document. Read for design intent.
4. **Brainstorm spec at `/home/shanyuan/.claude/plans/grill-me-i-want-to-wiggly-toast.md`** — locked decisions and rationale (why personal-first, why Anthropic-only, why no real cron, etc.).

## Hard constraint — GPL contamination

`ref/llm_wiki/` is `nashsu/llm_wiki`, a mature reference implementation under **GPL v3**. The user wants potential future commercial use of RARE. Treat the reference as read-only inspiration.

- ✅ Read it to understand patterns and approaches.
- ✅ Re-derive ideas in your own implementation.
- ❌ Never copy code (not even a 5-line function) into the RARE repo.
- ❌ Never run `cp` or paste-via-clipboard from `ref/llm_wiki/` into `src/`, `src-tauri/`, etc.

If asked to implement something already in `ref/llm_wiki/`: read the file, close it, write your own.

## Working conventions

### Auto-commit per task (mandatory)

The plan is structured as TDD bite-sized tasks (e.g. 1.7, 2.3, 3.1). Each task ends with a `git commit`. **Always commit at the end of every task.** Do not batch commits across multiple tasks — one task = one commit. This makes the git log a faithful trace of progress and makes any single task reversible.

Commit message format (conventional commits):

```
<type>(<scope>): <imperative summary>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`. Scope is usually the module (`vault`, `ingest`, `chat`, `lint`, `llm`, `ui`).

Example: `feat(ingest): Step 1 analyze with structural test + prompt snapshot`

### Milestone progress log (mandatory)

When a **milestone** is reached, append an entry to `PROGRESS.md` in the same commit that completes the milestone. Milestones are coarser than tasks:

- ✅ Phase boundary completed (e.g. "Phase 1 — Vault + Ingest Happy Path done")
- ✅ Major user-visible feature shipped (e.g. "First successful end-to-end URL→wiki→chat run")
- ✅ Verification gate passed (e.g. "Recovery test passes", "20-question eval ≥70%")
- ✅ Architecture decision reversed or new external dependency adopted

Do **not** log every commit. Aim for ~5–15 PROGRESS entries by v1 release.

Format per entry — see existing `PROGRESS.md` for the template.

### TDD discipline

Tasks are written test-first. When implementing a task:

1. Write the failing test exactly as the plan specifies (or as your judgment dictates if the plan is silent).
2. Run it — verify it fails for the **right reason** (missing module is fine; passing accidentally is a red flag).
3. Implement the minimum to make it pass.
4. Verify it passes.
5. Refactor if needed; tests stay green.
6. Commit (and update `PROGRESS.md` if this completes a milestone).

Do not skip Step 2 ("verify it fails"). A test that passes before the implementation exists is broken.

### What NOT to test (per tdd-guide)

These have low signal-to-noise. Don't write tests for them:

- Exact wording of LLM outputs (non-deterministic; assert structure instead).
- `overview.md` body content (assert only that it's written and non-empty).
- `log.md` timestamp format (clock-sensitive).
- Zustand store shape (UI state, no business logic).
- Cost arithmetic in isolation (~3 lines; tested by forwarding assertions).
- Slug generation exhaustively (3 non-obvious cases suffice).

### Single LLM mock seam

All ingest/chat/lint tests mock exactly **`src/llm/anthropic.ts`** via `vi.mock`. Never mock `@anthropic-ai/sdk` directly — keep the seam at the wrapper.

The fixture `tests/fixtures/analyze-v1.json` is the canonical Step 1 mock return for downstream tests. Regenerating it is an intentional act (commit message should call it out).

### Prompt regression

Prompts live in `prompts/*.md` and are snapshot-tested. When you change a prompt, Vitest will flag the snapshot diff — review the diff, run `npx vitest run -u` only after consciously accepting the change. A prompt edit is a behavior change; treat it like a code change.

### Real-LLM tests are gated

- `RARE_REAL_LLM=1` enables `it.skipIf(!realLLM)` tests in unit suites. Don't run in CI.
- `RARE_EVAL=1` enables the `eval/retrieval.eval.ts` 20-question set. Run locally before prompt changes; schedule nightly in CI.

## Project commands

```bash
npm run dev              # vite dev server (not used much — use tauri dev)
npm run tauri dev        # launch the desktop app in dev mode
npm run tauri build      # production binary build
npx tsc --noEmit         # type-check
npx vitest run           # all unit tests (mocks only)
npx vitest run -u        # update snapshots intentionally
RARE_REAL_LLM=1 npx vitest run   # include real-LLM tests
RARE_EVAL=1 ANTHROPIC_API_KEY=... RARE_EVAL_VAULT=... npx vitest run eval/
cd src-tauri && cargo test       # Rust-side tests (PDF extract, sqlite migration)
```

## Code style

- **Immutability.** Return new objects; do not mutate state in place.
- **Files small.** 200–400 lines typical, hard cap 800.
- **Errors handled.** Never swallow silently. Surface to the user (toast / settings warning) where appropriate.
- **No emojis** in code, comments, or commit messages.
- **No comments explaining what code does** — explain WHY when non-obvious; the code says what.
- **TypeScript strict.** No `any` except where explicitly justified (e.g. Anthropic tool-schema typing has a known gap).

## v1 scope discipline

This list is closed for v1. Anything not on it requires explicit "is this v2 yet?" conversation:

**In:** Tauri app, URL/PDF/markdown ingest, two-step CoT, index/log/overview maintenance, source/entity/concept page types, persistent queue with retry, single-conversation chat with citations, run-on-open lint, cost telemetry, Obsidian-compatible vault, swappable retrieval, `purpose.md`/`schema.md` knobs.

**Out (v2+):** multi-conversation chat, DOCX/PPTX/XLSX, in-app graph viz, browser extension, deep research / web search, vector or BM25 search, real cron, multi-LLM, team mode, image/vision, KaTeX math.

## Memory pointers

Long-term memory for this project lives at `~/.claude/projects/-media-nine-HD-2-shanyuan-RARE/memory/`. See `project_rare.md` for the persistent project context.
