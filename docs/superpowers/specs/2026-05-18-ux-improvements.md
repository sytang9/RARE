# RARE UX Improvements — Design Spec

**Date:** 2026-05-18
**Status:** Approved

## Overview

Seven improvements across graph, chat, wiki, sources, and cost tracking. All build on existing v1 infrastructure — no new external dependencies except an Opus model ID.

---

## Q1 — Lint Cost Safety (no change required)

Lint already safe by design:
- Model: Haiku (cheapest tier)
- Max output tokens: 2048
- Guard: `maybeRunLint` skips if fewer than `lint_interval_hours` (default 24h) have elapsed since last run, and if vault has zero pages
- Estimated cost: $0.001–$0.005 per run for a small vault (<50 pages)

No code changes needed. Users can raise the interval in Settings if they want less frequent runs.

---

## Q2 — Graph Node Overlap

**Problem:** d3-force has no collision radius, so nodes overlap when the vault has many pages.

**Solution:** Add `forceCollide` and increase charge repulsion in `GraphView.tsx`.

### Changes

**`src/views/GraphView.tsx`**
- Add `d3ForceCollide` prop to `<ForceGraph2D>`: radius = `Math.sqrt(node.val) * 5 + 8` (matches node draw radius plus padding)
- Increase `d3AlphaDecay` slightly so simulation settles faster
- Increase `d3VelocityDecay` to dampen oscillation

No new dependencies — `react-force-graph-2d` exposes all d3-force props directly.

---

## Q3 — Chat Model Switching

**Problem:** Chat is hardcoded to Sonnet. Users can't switch to Haiku (cheaper) or Opus (smarter) and can't enable extended thinking.

### UI

Header bar of `ChatView`:
```
[Chat]                    [Haiku] [Sonnet] [Opus]   [THINK ○/●]
```

- Segmented pill for model (Haiku / Sonnet / Opus)
- Separate THINK toggle to the right
- THINK toggle is **disabled and greyed out** when Haiku is selected (Haiku does not support extended thinking)
- State persists in component (`useState`) — resets to Sonnet on tab switch (no persistence to disk needed for v1)

### Backend / API

**`src/llm/anthropic.ts`**
- Add `'opus'` to `ModelTier` type and `MODEL_IDS` map: `opus: 'claude-opus-4-7'`
- Add optional `thinking` param to `ChatOptions`: `thinking?: { type: 'enabled'; budget_tokens: number }`
- When `thinking` is set, pass it to `client.messages.create`

**`src/chat/answer.ts`**
- Accept optional `model: ModelTier` and `thinking: boolean` in its options
- When `thinking: true`, pass `{ type: 'enabled', budget_tokens: 8000 }` to `chat()`

**`server.ts` — `POST /api/chat`**
- Read `model: string` and `thinking: boolean` from request body
- Validate `model` is one of `haiku | sonnet | opus`, default `sonnet`
- Pass to `answer()`

**Cost note:** Opus is significantly more expensive. The THINK toggle defaults to off. Cost for each query is already logged in `log.md`.

---

## Q4 — Wiki Text Width

**Problem:** `max-w-2xl` (42rem) leaves wide empty margins on normal screens.

**Solution:** Change the content wrapper in `WikiView.tsx` from `max-w-2xl` to `max-w-4xl` (56rem). This fills typical 1280px+ screens comfortably without going full-bleed.

Single line change in `src/views/WikiView.tsx`.

---

## Q5 — Wiki Wikilink Navigation (Bug Fix)

**Problem:** Clicking `[[wikilinks]]` navigates to the home page instead of the target page.

**Root cause to investigate:** `processBody()` converts `[[target]]` to `[target](wiki:${encodeURIComponent(target)})`. The `wiki:` scheme may be getting treated as a relative URL by the browser, resolving to `/wiki:target` and triggering the SPA fallback. The ReactMarkdown `a` component checks `href?.startsWith('wiki:')` but by the time the browser handles the click the href may have been resolved to an absolute URL.

**Fix:** Change the custom `a` component to check `href?.includes('wiki:')` (handles both `wiki:target` and `http://localhost/wiki:target` forms). Extract the target with `href.split('wiki:')[1]` and decode it. Also add `e.preventDefault()` explicitly in the click handler to block browser navigation entirely.

Single-file fix in `src/views/WikiView.tsx`.

---

## Q6 — Cost Per Source Document

**Problem:** SourcesView shows size and date but not how much each document cost to ingest.

### Data Source

`log.md` already contains per-ingest cost:
```
## [2026-05-18 10:00] ingest | Backpropagation
- source: "raw/sources/backpropagation.md"
- cost_usd: 0.099386
```

### New API endpoint

**`GET /api/costs/sources`** — parses `log.md`, groups by `source` path, sums `cost_usd` per source. Returns:
```json
{ "raw/sources/backpropagation.md": 0.099386, "raw/sources/attention.md": 0.082 }
```

### UI

**`src/views/SourcesView.tsx`**
- Fetch `/api/costs/sources` on mount alongside `/api/sources`
- Add cost to each card: right-aligned green `$0.099` with `ingest cost` label below
- Shows `—` if source has no log entry (ingested before cost tracking was added)

---

## Q7 — Cost Breakdown Dashboard

**Problem:** Settings shows only one monthly total. No breakdown by operation type, no daily view.

### New API endpoint

**`GET /api/costs?period=today|month|all`** — parses `log.md`, groups entries by date and event type. Log event `query` is exposed as `chat` in the response. `today` = current UTC calendar day. Returns:
```json
{
  "total": 0.181,
  "byType": { "ingest": 0.099, "chat": 0.054, "lint": 0.027 },
  "byDay": [
    { "date": "2026-05-17", "ingest": 0.099, "chat": 0.054, "lint": 0.002 },
    { "date": "2026-05-18", "ingest": 0.082, "chat": 0.000, "lint": 0.025 }
  ]
}
```

### UI — Settings tab cost section

Replace the current single `monthly_cost_usd` line with a full cost section:

**Period toggle:** Today / This month / All time — segmented pill, same style as model switcher.

**Summary bar:**
- Total $ for selected period (large)
- Stacked horizontal bar: ingest (green) / chat (blue) / lint (amber) — proportional widths
- Legend below bar with per-type totals

**Daily table:**
- Columns: Date | Ingest | Chat | Lint
- Sorted newest-first
- Empty days omitted
- Shows `—` for zero-cost columns

**No new chart library** — the stacked bar is pure CSS `flexbox` with colored `div`s. The table is plain HTML. No recharts/d3 needed.

### Log parser

**`src/lib/cost.ts`** — add `parseCostLog(logText)` that returns structured `{ byType, byDay }` data. `sumLogCosts` stays for backwards compat.

---

## File Map

| File | Change |
|------|--------|
| `src/views/GraphView.tsx` | Add forceCollide + tune repulsion |
| `src/views/WikiView.tsx` | Fix wikilink `href` check; widen to `max-w-4xl` |
| `src/views/ChatView.tsx` | Add model pill + THINK toggle in header |
| `src/views/SourcesView.tsx` | Add ingest cost column, fetch `/api/costs/sources` |
| `src/views/SettingsView.tsx` | Replace monthly number with full cost breakdown section |
| `src/llm/anthropic.ts` | Add Opus to MODEL_IDS; add `thinking` to ChatOptions |
| `src/chat/answer.ts` | Accept + forward `model` and `thinking` params |
| `src/lib/cost.ts` | Add `parseCostLog()` |
| `server.ts` | Add `GET /api/costs`, `GET /api/costs/sources`; update `POST /api/chat` |

---

## Out of Scope

- Persisting model/thinking preference across sessions (v2)
- Per-query cost shown in the chat bubble (v2)
- Custom date range picker (v2 — Today/Month/All covers the need)
- Recharts or any charting library (CSS-only bar is sufficient)
