# RARE

**Read And Remember Everything** — a personal knowledge system that ingests pasted URLs, PDFs, and markdown into a self-maintaining Obsidian-compatible wiki, then answers questions over it.

Based on Andrej Karpathy's [llm-wiki pattern](ref/llm-wiki.md). Unlike RAG, RARE incrementally builds and maintains a structured markdown wiki that the LLM navigates directly — knowledge compounds across sources rather than being re-derived on every query.

## Status

🚧 **v1 in design.** Architecture and implementation plan are written; coding has not started. See:

- `docs/ARCHITECTURE.md` — subsystems, data layout, interfaces
- `docs/superpowers/plans/2026-05-16-rare-v1.md` — TDD implementation plan
- `CLAUDE.md` — working conventions
- `PROGRESS.md` — milestone log

## How it will work (when built)

1. Paste a URL, drop a PDF, or write markdown directly.
2. Anthropic Haiku reads it in two steps: analyze → generate. New wiki pages are written; `index.md`, `log.md`, and `overview.md` update.
3. Ask questions in the chat. Anthropic Sonnet picks relevant pages from `index.md`, reads them, answers with `[[wikilink]]` citations.
4. Daily lint pass surfaces orphans, dead links, contradictions, and stale claims.
5. Open the vault folder in Obsidian for graph view and free-form editing.

## v1 stack

Tauri v2 (Rust) + React 19 + TypeScript + Vite + shadcn/ui + Tailwind. Zustand for state. `@anthropic-ai/sdk` for the brain. sqlite (via `tauri-plugin-sql`) for queue + settings. Vitest for tests.

## License

TBD pending v1 release. Will not be GPL — see `CLAUDE.md` for why the `ref/llm_wiki/` reference is read-only inspiration only.
