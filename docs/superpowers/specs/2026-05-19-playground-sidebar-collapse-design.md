# RARE Playground + Sidebar Collapse — Design Spec

**Date:** 2026-05-19
**Status:** Approved for implementation

---

## 1. Overview

Two features shipped together:

1. **Knowledge Orbit Playground** — an interactive canvas on the right half of the Ingest page showing vault concepts, entities, and sources as floating physics bodies the user can play with.
2. **Collapsible Sidebars** — toggle buttons on the left panels of WikiView and ChatView so users can reclaim horizontal space.

---

## 2. Knowledge Orbit Playground

### 2.1 Layout change

`PasteView` changes from a single left-aligned column to a two-column split:

```
┌──────────────────────────────────────────────────────────┐
│  [Left: ingest form ~480px fixed]  │  [Right: playground] │
│  (existing content, unchanged)     │  (fills remainder)   │
└──────────────────────────────────────────────────────────┘
```

- Left column: `w-[480px] shrink-0`, existing form unchanged
- Right column: `flex-1 min-w-0`, a `<canvas>` sized to fill the panel
- Divider: `border-l border-rim`
- On narrow viewports (`< 900px`), playground hides (`hidden lg:block`) — the form still works normally

### 2.2 Data source

Reuses the existing `GET /api/pages` endpoint. Returns `PageMeta[]` with `{ id, title, type }`. No new API needed.

- Fetched on mount, re-fetched after each successful ingest job completion (the polling loop already runs in PasteView — hook into the transition from `processing → done`)
- Cap at **40 words** — most recently updated pages, sorted by whatever order the API returns (already recency-sorted server-side)

### 2.3 Word bodies

Each `PageMeta` becomes a physics body:

```ts
interface WordBody {
  text: string;         // page title, truncated to 24 chars if longer
  type: PageType;       // concept | entity | source
  x: number; y: number;
  vx: number; vy: number;
  w: number; h: number; // bounding box, measured from canvas context
}
```

**Color by type** (matches existing wiki type badges):
- `concept` → `#f0a030` (amber)
- `entity` → `#38bdf8` (sky)
- `source` → `#34d399` (emerald)

**Font**: `12px monospace`. No size variation — uniform size keeps the layout predictable.

**Opacity**: 0.75 default, 1.0 on cursor-near (within 80px).

### 2.4 Physics

Pure `requestAnimationFrame` loop — no external physics library.

**Each frame:**

1. **Cursor attraction** — if cursor is over the canvas, apply a pull force toward cursor for every word:
   ```
   dx = cursor.x - word.x
   dy = cursor.y - word.y
   dist = sqrt(dx² + dy²)
   strength = clamp(800 / dist², 0, 0.4)   // falls off with distance, capped
   word.vx += dx/dist * strength
   word.vy += dy/dist * strength
   ```

2. **Ambient drift** — when cursor is absent, each word gets a tiny random nudge each frame (`±0.02` per axis) so the panel is never fully static.

3. **Damping** — after forces: `vx *= 0.97; vy *= 0.97`. Prevents runaway speed.

4. **Speed cap** — clamp `|v|` to 3.5 px/frame.

5. **Wall bounce** — soft bounce off canvas edges with 20px padding. On hit, reverse velocity component and apply 0.6 restitution.

6. **Word–word separation** — simple axis-aligned overlap check. If two words' bounding boxes overlap, push them apart by half the overlap distance each. No rotation, no angular momentum.

7. **Position update** — `x += vx; y += vy`.

### 2.5 New-ingest burst animation

When PasteView detects a job transitions `processing → done`:

- Fetch updated page list
- Diff against current word set to find new entries
- For each new word: spawn at a random point on the canvas edge, give it an inward initial velocity (toward canvas center ± 30° jitter), let the physics loop take over
- No special animation needed beyond the normal physics — the burst is just the initial velocity

### 2.6 Empty state

When `pages.length === 0`, render instead of the canvas:

```
[centered in the panel]

  ✦  (faint pulsing icon, opacity 0.2–0.4)

  Your knowledge will appear here.
  Ingest your first source to begin.

  (font: monospace 11px, color: ink-dim)
```

No animation beyond the soft pulse on the icon.

### 2.7 Component structure

New file: `src/views/PlaygroundCanvas.tsx`

```ts
interface Props {
  pages: PageMeta[];
  newPageIds: Set<string>;   // ids that just appeared — triggers burst
  onBurstDone: () => void;   // clear newPageIds after burst
}
export function PlaygroundCanvas({ pages, newPageIds, onBurstDone }: Props)
```

`PasteView` imports and renders it. The canvas sizing uses a `ResizeObserver` to track the container div and keep canvas dimensions in sync.

---

## 3. Collapsible Sidebars

### 3.1 WikiView sidebar

The left page-list panel (`w-[260px]`) gets a collapse toggle.

**Collapsed**: panel width → 0, content hidden. A narrow toggle strip (`w-8`) remains visible with a `ChevronRight` icon.
**Expanded**: current layout, toggle shows `ChevronLeft`.

```
Expanded:                    Collapsed:
┌──────────┬──────────────┐  ┌──┬────────────────────┐
│ page list│ page content │  │▶ │    page content    │
│  260px   │   flex-1     │  │  │      flex-1        │
└──────────┴──────────────┘  └──┴────────────────────┘
```

- State: `const [sidebarOpen, setSidebarOpen] = useState(true)` — local, not persisted
- Transition: `transition-all duration-200` on the panel width
- Collapsed width: `w-8` (the toggle strip), expanded: `w-[260px]`
- Toggle button: sits at the top-right corner of the sidebar, `ChevronLeft` / `ChevronRight`

### 3.2 ChatView sidebar

Same treatment on the chat history left panel.

- Same state pattern, same toggle icon placement
- Collapsed: history panel hides, toggle strip stays; active chat content fills the view

### 3.3 What does NOT collapse

- The main app `<aside>` nav (the 220px left nav with logo + nav items) — this stays always visible. It is not a sidebar in the same sense; collapsing it would remove primary navigation.

---

## 4. Out of scope

- Persisting sidebar collapsed state across sessions
- Mobile/touch physics adjustments
- Clicking a word in the playground to navigate to that wiki page (could be v2)
- Zooming / filtering words by type in the playground (v2)

---

## 5. Files changed

| File | Change |
|---|---|
| `src/views/PasteView.tsx` | Two-column layout, fetch pages, pass to PlaygroundCanvas, detect burst events |
| `src/views/PlaygroundCanvas.tsx` | New file — canvas component with physics loop |
| `src/views/WikiView.tsx` | Add `sidebarOpen` state + collapse toggle |
| `src/views/ChatView.tsx` | Add `sidebarOpen` state + collapse toggle |
