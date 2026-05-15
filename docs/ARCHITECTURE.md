# RARE Architecture

**RARE** (Read And Remember Everything) is a single-user Tauri desktop app that ingests pasted URLs, PDFs, and markdown into a self-maintaining markdown wiki. The wiki folder is Obsidian-compatible. Anthropic Claude (Haiku + Sonnet) is the only "intelligence" — the rest is glue.

This document is the reference for what exists and where. For the *why* (design rationale and decisions), see the brainstorm spec at `/home/shanyuan/.claude/plans/grill-me-i-want-to-wiggly-toast.md`. For *how to build it*, see `docs/superpowers/plans/2026-05-16-rare-v1.md`.

---

## 1. System overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Tauri Desktop App (single window, single user)                  │
│                                                                 │
│  React UI                          Tauri Rust core              │
│  ├── Paste view                    ├── HTTP plugin (fetch URLs) │
│  ├── Sources view                  ├── SQL plugin (sqlite)      │
│  ├── Chat view                     └── pdf-extract crate        │
│  └── Settings                                                   │
│                                                                 │
│  TypeScript glue                                                │
│  ├── Ingest pipeline   ──┐                                      │
│  ├── Retrieval         ──┤                                      │
│  ├── Chat              ──┼──▶ Anthropic API (Haiku + Sonnet)    │
│  └── Lint              ──┘                                      │
└─────────────────────────────────────────────────────────────────┘
          │                                  │
          ▼                                  ▼
  ┌────────────────┐                  ┌──────────────────┐
  │  vault on disk │  ◀──also open────│ Obsidian (viewer)│
  │  (markdown)    │     by user      └──────────────────┘
  └────────────────┘
```

**Three layers:**

1. **Raw sources** (`vault/raw/`) — immutable originals. Never rewritten.
2. **Wiki** (`vault/wiki/`) — LLM-generated and maintained markdown.
3. **App state** (`vault/.rare/`) — sqlite for queue, settings, chats. Recoverable; losing it does not corrupt the wiki.

---

## 2. Subsystems

### 2.1 Ingest pipeline

Two LLM calls (both Haiku) per source. Separation enables debugging, caching, and crash recovery — the analysis is a stable artifact you can re-use.

**Step 1 — Analyze** (`src/ingest/analyze.ts`)

Input: raw source text + `purpose.md` + `schema.md` + current `index.md`.
Output: structured JSON via Anthropic tool-use:

```ts
interface AnalyzeResult {
  source_title: string;
  source_summary: string;        // 2–4 sentences
  entities: Array<{
    name: string;
    type: 'person' | 'organization' | 'product' | 'place';
    description: string;
    is_new: boolean;             // true if not yet in wiki
  }>;
  concepts: Array<{
    name: string;
    description: string;
    is_new: boolean;
  }>;
  connections: Array<{           // links to existing wiki pages
    target_page: string;         // e.g. "concepts/cosine-similarity"
    relation: string;            // e.g. "extends", "contradicts", "references"
  }>;
  contradictions: Array<{        // claims that conflict with existing wiki
    existing_page: string;
    conflict: string;            // 1-2 sentences
  }>;
  recommended_pages: Array<{
    action: 'create' | 'update';
    path: string;                // e.g. "entities/alice-smith"
    rationale: string;
  }>;
}
```

**Step 2 — Generate** (`src/ingest/generate.ts`)

Input: Step 1 result + bodies of any wiki pages flagged for update.
Output: file writes. The LLM produces markdown bodies; TS code writes the files, updates `index.md`, appends to `log.md`, regenerates `overview.md`.

**Properties of the pipeline:**

- **SHA256 cache.** Before Step 1, hash the source content. If it matches a previous ingest hash in sqlite, skip (no LLM call).
- **Serial.** One ingest at a time. Prevents the wiki from being written by two concurrent generations.
- **Persisted.** Tasks live in `queue.sqlite` so an app crash mid-ingest is recoverable.
- **Retry.** Failed tasks retry up to 3 times with exponential backoff.

### 2.2 Retrieval + chat

**Retrieval** is intentionally a single function — the contract that lets v1 ship without search infrastructure and v2 swap it in trivially.

```ts
// src/retrieve/findRelevantPages.ts
export interface RelevantPage {
  path: string;          // wiki-relative, e.g. "concepts/cosine-similarity"
  title: string;
  body: string;          // full page contents
}

export async function findRelevantPages(
  query: string,
  vault: VaultRoot,
): Promise<RelevantPage[]>;
```

v1 implementation: feed Sonnet the current `index.md` and the user's query, ask which pages to read, then read them. v2 swap-in (BM25 or vector) keeps the same signature.

**Chat** (`src/chat/answer.ts`)

```ts
export interface AnswerResult {
  text: string;                     // markdown, may include [[wikilinks]]
  citations: string[];              // page paths used in the answer
  cost: { input_tokens: number; output_tokens: number; usd: number };
}

export async function answer(
  query: string,
  conversation: Message[],
  vault: VaultRoot,
): Promise<AnswerResult>;
```

The Sonnet system prompt includes `purpose.md`, citation rules, and the bodies of retrieved pages numbered for inline reference.

### 2.3 Lint

`src/lint/run.ts` reads the wiki and writes `wiki/lint/YYYY-MM-DD.md`.

Detects:

- **Orphans** — wiki pages with no inbound `[[wikilinks]]` (excluding `index.md`, `log.md`, `overview.md`).
- **Dead links** — `[[wikilinks]]` whose target file does not exist.
- **Contradictions** — claims that conflict across pages (Haiku judgment over related-page clusters).
- **Stale claims** — older claims superseded by newer sources (detected via `sources[]` frontmatter timestamps).
- **Suggested cross-references** — pages that mention an entity/concept without linking to its page.

Lint is read-only — it produces a report, not edits. The user decides whether to act.

### 2.4 Queue runner

`src/ingest/queue.ts` owns the sqlite queue and the worker loop.

```ts
type TaskStatus = 'pending' | 'processing' | 'done' | 'failed';

interface QueueTask {
  id: number;
  source_path: string;         // path under raw/sources/
  sha256: string;
  status: TaskStatus;
  retry_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export const queue = {
  enqueue(sourcePath: string, sha256: string): Promise<QueueTask>;
  next(): Promise<QueueTask | null>;              // claims next pending task
  markDone(id: number): Promise<void>;
  markFailed(id: number, error: string): Promise<void>;
  recoverInFlight(): Promise<void>;               // on app start: pending←processing
  list(filter?: { status?: TaskStatus }): Promise<QueueTask[]>;
};
```

The worker loop runs in a Zustand-managed background async function. On app start, `recoverInFlight()` resets any tasks left as `processing` (app died mid-ingest).

### 2.5 Vault file ops

`src/vault/` owns all markdown read/write. No other module touches the file system directly for wiki content.

```ts
// src/vault/page.ts
export interface PageFrontmatter {
  type: 'source' | 'entity' | 'concept';
  title: string;
  sources: string[];           // raw/-relative paths
  created: string;             // ISO
  updated: string;             // ISO
}

export interface Page {
  path: string;                // wiki-relative
  frontmatter: PageFrontmatter;
  body: string;
}

export async function readPage(vault: VaultRoot, path: string): Promise<Page>;
export async function writePage(vault: VaultRoot, page: Page): Promise<void>;
export async function listPages(
  vault: VaultRoot,
  type?: PageFrontmatter['type'],
): Promise<Page[]>;
export async function deletePage(vault: VaultRoot, path: string): Promise<void>;

// src/vault/wikilinks.ts
export function extractWikilinks(markdown: string): string[];
export function replaceWikilinks(
  markdown: string,
  resolver: (target: string) => string | null,
): string;

// src/vault/index.ts (the index.md file, not the JS index)
export async function updateIndex(vault: VaultRoot, page: Page): Promise<void>;
export async function removeFromIndex(vault: VaultRoot, path: string): Promise<void>;
export async function readIndex(vault: VaultRoot): Promise<string>;

// src/vault/log.ts
export async function appendLog(
  vault: VaultRoot,
  event: 'ingest' | 'lint' | 'query',
  title: string,
  detail?: Record<string, unknown>,
): Promise<void>;

// src/vault/overview.ts
export async function regenerateOverview(
  vault: VaultRoot,
  llm: AnthropicClient,
): Promise<void>;
```

### 2.6 Settings

`src/settings/` owns the settings table in sqlite.

```ts
interface Settings {
  anthropic_api_key: string;
  vault_path: string;
  haiku_model: string;          // default: 'claude-haiku-4-5-20251001'
  sonnet_model: string;         // default: 'claude-sonnet-4-6'
  cost_ceiling_usd: number;     // monthly soft cap; warn on UI when exceeded
  lint_interval_hours: number;  // default: 24
  language: 'en';               // v1 English only
}

export async function getSettings(): Promise<Settings>;
export async function updateSettings(patch: Partial<Settings>): Promise<Settings>;
```

API key is stored in sqlite (not env). Local-only app, single user — keychain integration is v2.

### 2.7 LLM client

`src/llm/anthropic.ts` — a thin wrapper over `@anthropic-ai/sdk`. The only place the SDK is imported. Provides:

```ts
export interface ChatOptions {
  model: 'haiku' | 'sonnet';     // resolved to actual IDs from settings
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];      // for structured outputs
  stream?: boolean;
}

export interface ChatResult {
  text: string;                  // assistant message text
  tool_use?: { name: string; input: unknown };
  input_tokens: number;
  output_tokens: number;
  usd: number;                   // computed from model + tokens
}

export async function chat(opts: ChatOptions): Promise<ChatResult>;
export async function chatStream(
  opts: ChatOptions,
  onDelta: (chunk: string) => void,
): Promise<ChatResult>;
```

All retries, rate-limit handling, and cost computation live here. Every other module imports `chat`/`chatStream` only.

---

## 3. Data layout on disk

```
my-vault/                       # user-chosen vault root
├── purpose.md                  # user-edited: vault goals, key questions
├── schema.md                   # user-edited: page conventions, LLM rulebook
├── raw/
│   ├── sources/                # immutable: article.md, paper.pdf, …
│   └── assets/                 # extracted images (v2)
├── wiki/
│   ├── index.md                # one-line catalog of every page
│   ├── log.md                  # append-only event log
│   ├── overview.md             # auto-regenerated global summary
│   ├── sources/                # one summary per raw source
│   ├── entities/               # people, orgs, products, places
│   ├── concepts/               # theories, methods, topics
│   └── lint/                   # YYYY-MM-DD.md reports
│
├── .obsidian/                  # auto-generated Obsidian config
└── .rare/
    ├── settings.sqlite         # API key, model choices, cost ceiling, …
    └── chats/                  # one JSON per conversation
```

### 3.1 Wiki page conventions

Every page has YAML frontmatter. Cross-references use `[[wikilink]]`. Filenames are kebab-case slugs.

```markdown
---
type: concept
title: Cosine Similarity
sources:
  - raw/sources/intro-to-similarity-metrics.md
  - raw/sources/embedding-models-overview.pdf
created: 2026-05-16T14:32:00Z
updated: 2026-05-16T14:32:00Z
---

# Cosine Similarity

Cosine similarity measures the angle between two vectors, …

## Relation to other concepts

Often contrasted with [[concepts/euclidean-distance]] when reasoning about
vector embeddings.
```

### 3.2 `index.md` format

```markdown
# Index

## Concepts
- [[concepts/cosine-similarity]] — angle-based measure of vector similarity
- [[concepts/embedding]] — fixed-length numeric representation of input

## Entities
- [[entities/alice-smith]] — researcher at OpenAI, focus on retrieval

## Sources
- [[sources/intro-to-similarity-metrics]] — 2024-08, blog post
```

Grouped by type, one line each. Read whole into the LLM's context for retrieval.

### 3.3 `log.md` format

```markdown
## [2026-05-16 14:32] ingest | Intro to Similarity Metrics
- source: raw/sources/intro-to-similarity-metrics.md
- pages_written: 5 (1 source, 2 entities, 2 concepts)
- cost: $0.012 (input 4231, output 1890)

## [2026-05-16 14:45] query | "what's the difference between cosine and euclidean?"
- pages_read: concepts/cosine-similarity, concepts/euclidean-distance
- cost: $0.034 (input 8120, output 1240)
```

Greppable prefix `## [` means `grep "^## \[" log.md | tail -20` yields a clean timeline.

### 3.4 sqlite schema (`.rare/settings.sqlite`)

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE ingest_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','done','failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (sha256)
);

CREATE INDEX idx_queue_status ON ingest_queue (status);

CREATE TABLE analyze_cache (
  sha256 TEXT PRIMARY KEY,
  analyze_json TEXT NOT NULL,    -- serialized AnalyzeResult
  created_at TEXT NOT NULL
);
```

Chat history lives as JSON files in `.rare/chats/`, not in sqlite — chats are append-only, easy to inspect, easy to back up.

---

## 4. Data flows

### 4.1 Ingest flow (paste a URL)

```
User pastes URL
   │
   ▼
src/sources/url.ts
   ├── fetch via @tauri-apps/plugin-http
   ├── Readability → cleaned HTML
   ├── Turndown    → markdown
   └── write to vault/raw/sources/<slug>.md
       │
       ▼
src/ingest/queue.ts
   └── enqueue({ source_path, sha256 })
       │
       ▼
worker loop (background)
   ├── claim task (pending → processing)
   ├── check analyze_cache; if hit, use cached Step 1
   ├── src/ingest/analyze.ts → Haiku Step 1 → AnalyzeResult
   ├── persist AnalyzeResult to analyze_cache
   ├── src/ingest/generate.ts → Haiku Step 2 → markdown files
   ├── src/vault/page.ts → write source/entity/concept pages
   ├── src/vault/index.ts → updateIndex
   ├── src/vault/log.ts   → appendLog('ingest', …)
   ├── src/vault/overview.ts → regenerateOverview
   └── markDone(task.id)
```

### 4.2 Query flow

```
User submits question
   │
   ▼
src/chat/answer.ts
   ├── src/retrieve/findRelevantPages.ts
   │   ├── read index.md
   │   ├── ask Sonnet which pages to read (tool-use)
   │   └── read those pages → RelevantPage[]
   ├── build prompt: purpose.md + numbered page bodies + conversation + query
   ├── Sonnet streaming → chunks → UI
   ├── extract [[wikilinks]] from answer → citations
   ├── src/vault/log.ts → appendLog('query', …)
   └── return AnswerResult
```

### 4.3 Lint flow (on app open if >24h)

```
App start
   │
   ▼
src/lint/scheduler.ts
   ├── read settings.lint_interval_hours
   ├── check last lint timestamp from log.md
   └── if stale: trigger src/lint/run.ts (non-blocking toast)
       │
       ▼
       src/lint/run.ts
       ├── list all wiki pages
       ├── compute orphan set (no inbound wikilinks)
       ├── compute dead-link set
       ├── batch related pages → Haiku for contradiction detection
       ├── batch entity mentions → Haiku for suggested cross-refs
       ├── write wiki/lint/YYYY-MM-DD.md
       └── appendLog('lint', …)
```

---

## 5. Project file layout

```
RARE/
├── ref/                                    # external reference, DO NOT copy from
│   ├── llm-wiki.md                         # Karpathy's design pattern
│   └── llm_wiki/                           # GPL v3 reference impl (do not fork)
│
├── docs/
│   ├── ARCHITECTURE.md                     # this file
│   └── superpowers/plans/                  # implementation plans
│
├── src-tauri/                              # Rust side
│   ├── src/
│   │   ├── main.rs                         # Tauri app entry
│   │   ├── pdf.rs                          # pdf-extract wrapper
│   │   └── sql.rs                          # sqlite migrations
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                                    # TypeScript side
│   ├── App.tsx
│   ├── main.tsx
│   │
│   ├── views/
│   │   ├── PasteView.tsx                   # paste box + queue activity
│   │   ├── SourcesView.tsx                 # list ingested sources
│   │   ├── ChatView.tsx                    # single-convo chat
│   │   └── SettingsView.tsx                # API key, models, cost ceiling
│   │
│   ├── state/
│   │   ├── queueStore.ts                   # Zustand
│   │   ├── chatStore.ts                    # Zustand
│   │   └── settingsStore.ts                # Zustand
│   │
│   ├── llm/
│   │   └── anthropic.ts                    # SDK wrapper, cost, retries
│   │
│   ├── sources/
│   │   └── url.ts                          # URL fetch + Readability + Turndown
│   │
│   ├── ingest/
│   │   ├── analyze.ts                      # Step 1
│   │   ├── generate.ts                     # Step 2
│   │   ├── queue.ts                        # sqlite queue
│   │   └── worker.ts                       # background loop
│   │
│   ├── retrieve/
│   │   └── findRelevantPages.ts            # swappable interface
│   │
│   ├── chat/
│   │   └── answer.ts                       # Sonnet orchestration
│   │
│   ├── lint/
│   │   ├── run.ts                          # lint pass
│   │   └── scheduler.ts                    # run-on-open check
│   │
│   ├── vault/
│   │   ├── root.ts                         # VaultRoot type + path helpers
│   │   ├── page.ts                         # read/write/list pages
│   │   ├── frontmatter.ts                  # gray-matter wrapper
│   │   ├── wikilinks.ts                    # parse/replace [[links]]
│   │   ├── index.ts                        # index.md ops
│   │   ├── log.ts                          # log.md ops
│   │   ├── overview.ts                     # overview.md regen
│   │   └── slug.ts                         # kebab-case slug generation
│   │
│   ├── settings/
│   │   └── settings.ts                     # sqlite-backed settings
│   │
│   └── lib/
│       ├── sha256.ts
│       ├── cost.ts                         # token → USD math
│       └── obsidian-config.ts              # auto-generate .obsidian/
│
├── prompts/                                # versioned prompt templates
│   ├── analyze.md
│   ├── generate.md
│   ├── chat.md
│   └── lint.md
│
├── tests/
│   ├── __mocks__/anthropic.ts              # the single LLM mock seam
│   ├── fixtures/
│   │   ├── analyze-v1.json                 # recorded Step 1 fixture
│   │   ├── small-vault/                    # 10 pages for unit tests
│   │   └── eval-vault-50/                  # 50-source vault for eval set
│   ├── vault.test.ts
│   ├── analyze.test.ts
│   ├── generate.test.ts
│   ├── queue.test.ts
│   ├── chat.test.ts
│   └── lint.test.ts
│
├── eval/
│   └── retrieval.eval.ts                   # 20-question eval set, env-gated
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 6. Behavior knobs (no code changes required)

These two files are the runtime behavior surface. The LLM reads them on every relevant call.

### 6.1 `purpose.md`

User-authored. Defines what the vault is for. Loaded into the system prompt on ingest, query, and lint. Example:

```markdown
# Vault Purpose

This vault collects articles, papers, and notes I've meant to read about
machine learning, distributed systems, and product design.

## Key questions I want to answer
- How do practitioners actually deploy ML systems in production?
- What are the recurring failure modes of distributed consensus?
- Why do some product launches succeed in spite of poor design?

## Scope
Out of scope: politics, cooking, fiction.

## Tone for chat answers
Direct. Cite pages. Flag uncertainty. Don't pad.
```

### 6.2 `schema.md`

User-tunable, but RARE ships a sensible default. Defines page types and rules. Example:

```markdown
# Wiki Schema

## Page types

- **source**: one per ingested document. Frontmatter `sources` is `[]` (it IS a source).
- **entity**: a person, organization, product, or place. Required sections: Description, Notable Work, Connections.
- **concept**: a theory, method, or topic. Required sections: Definition, Related Concepts, Sources.

## Cross-linking policy

- Aggressively link entities and concepts the first time they appear in any page body.
- Avoid linking from headings.
- When an entity or concept is mentioned without a page, flag it as a review item.

## Contradiction handling

- When new source contradicts existing claim: keep both, add a "Tensions" section
  to the affected page, cite both sources.
```

---

## 7. Configuration & secrets

| Item | Where | Notes |
|---|---|---|
| Anthropic API key | `settings.sqlite` (`settings` table, key `anthropic_api_key`) | Plain-text local sqlite. Keychain integration is v2. |
| Vault path | `settings.sqlite` | Chosen at first run via Tauri dialog. |
| Model IDs | `settings.sqlite` | Defaults: Haiku 4.5, Sonnet 4.6. User-overridable. |
| Cost ceiling | `settings.sqlite` | Soft cap. UI banner at 80%, blocks new ingest at 100% (manual override). |
| Lint interval | `settings.sqlite` | Default 24h. |
| Prompts | `prompts/*.md` (bundled in app) | Loaded at runtime, not compiled in — easier to iterate. |

---

## 8. Out of scope for v1

Listed here so they don't sneak in:

- Multi-conversation chat, save-to-wiki, regenerate
- DOCX / PPTX / XLSX ingestion
- In-app graph visualization (Obsidian's graph view suffices)
- Browser extension web clipper
- Deep research / web search auto-fill
- Vector or BM25 search (gated by retrieval-quality eval)
- Real OS-level cron (run-on-open only)
- Multi-LLM provider abstraction (Anthropic only)
- Team mode, auth, shared vault
- Image extraction or vision captions
- KaTeX math rendering
- Keychain integration
- Auto-update mechanism

Anything here must clear an "is this v2 yet?" check before being added.
