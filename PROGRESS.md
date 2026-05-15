# RARE Progress Log

Reverse-chronological milestone log. One entry per **milestone**, not per commit. See `git log` for per-commit detail.

A milestone is a phase boundary, a major user-visible feature, a verification-gate pass, or an architectural pivot.

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
