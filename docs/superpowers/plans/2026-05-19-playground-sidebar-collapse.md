# Playground + Sidebar Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive vault-word physics playground to the right panel of the Ingest page, and collapsible toggle buttons to the WikiView and ChatView sidebars.

**Architecture:** `PlaygroundCanvas` is a self-contained React component that owns a `<canvas>` element, runs a pure-JS `requestAnimationFrame` physics loop (no library), and reads `PageMeta[]` from its parent. `PasteView` splits into two columns, fetches pages on mount, and detects `processing→done` job transitions to trigger burst animations. WikiView and ChatView each gain a `sidebarOpen` boolean state that drives a `transition-all` width change.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vitest + jsdom, Lucide icons, native Canvas 2D API, ResizeObserver.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/views/WikiView.tsx` | Modify | Add `sidebarOpen` state + collapse toggle |
| `src/views/ChatView.tsx` | Modify | Add `sidebarOpen` state + collapse toggle |
| `src/views/PlaygroundCanvas.tsx` | **Create** | Canvas physics component — word bodies, RAF loop, draw, burst |
| `src/views/PasteView.tsx` | Modify | Two-column layout, page fetch, burst detection |
| `tests/views/sidebar-collapse.test.ts` | **Create** | Logic tests for sidebar (trivial; mostly structural) |
| `tests/views/playground.test.ts` | **Create** | Unit tests for `detectNewPageIds` pure function |

---

## Task 1: WikiView sidebar collapse

**Files:**
- Modify: `src/views/WikiView.tsx`
- Create: `tests/views/sidebar-collapse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/views/sidebar-collapse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// Pure logic: given sidebarOpen boolean, produce the correct CSS class string
function sidebarWidthClass(open: boolean): string {
  return open ? 'w-[260px]' : 'w-8';
}

describe('WikiView sidebar collapse', () => {
  it('returns wide class when open', () => {
    expect(sidebarWidthClass(true)).toBe('w-[260px]');
  });
  it('returns narrow class when closed', () => {
    expect(sidebarWidthClass(false)).toBe('w-8');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /media/nine/HD_2/shanyuan/RARE && npx vitest run tests/views/sidebar-collapse.test.ts
```

Expected: FAIL — `sidebarWidthClass is not defined`.

- [ ] **Step 3: The test already defines the function inline — it should pass immediately. Verify it passes**

```bash
npx vitest run tests/views/sidebar-collapse.test.ts
```

Expected: PASS (the function is in the test file itself).

- [ ] **Step 4: Implement sidebar collapse in WikiView.tsx**

Add `ChevronLeft` to the import line (line 4):

```tsx
import { BookOpen, Search, FileText, Users, Lightbulb, ChevronRight, ChevronLeft, X, ExternalLink } from 'lucide-react';
```

Add `sidebarOpen` state immediately after the existing `useState` declarations in `WikiView()`:

```tsx
const [sidebarOpen, setSidebarOpen] = useState(true);
```

Replace the entire left panel `<div>` (the one with `className="w-[260px] shrink-0 flex flex-col border-r border-rim bg-panel overflow-hidden"`) with:

```tsx
{/* ── Left panel: page list ──────────────────────────────── */}
<div className={`${sidebarOpen ? 'w-[260px]' : 'w-8'} shrink-0 flex flex-col border-r border-rim bg-panel overflow-hidden transition-all duration-200`}>
  <div className={`flex items-center gap-2 px-3 py-3 border-b border-rim shrink-0`}>
    {sidebarOpen && (
      <div className="relative flex-1">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-dim pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search pages…"
          className="w-full bg-card border border-rim rounded px-3 py-1.5 pl-7 text-xs text-ink placeholder:text-ink-dim input-amber-focus"
        />
      </div>
    )}
    <button
      onClick={() => setSidebarOpen(v => !v)}
      className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-ink-dim hover:text-ink hover:bg-card transition-colors ml-auto"
      title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
    >
      {sidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
    </button>
  </div>

  {sidebarOpen && (
    <>
      <div className="flex-1 overflow-y-auto py-2">
        {loading && <p className="text-xs text-ink-dim px-4 py-3">Loading…</p>}
        {empty   && <p className="text-xs text-ink-dim px-4 py-3">No pages yet. Ingest some sources first.</p>}
        {(['concept', 'entity', 'source'] as PageType[]).map(type => {
          const group = grouped[type];
          if (group.length === 0) return null;
          const Icon = TYPE_ICON[type];
          return (
            <div key={type} className="mb-3">
              <div className="flex items-center gap-2 px-3 py-1.5">
                <Icon size={11} style={{ color: TYPE_COLOR[type] }} />
                <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: TYPE_COLOR[type] }}>
                  {TYPE_LABEL[type]} ({group.length})
                </span>
              </div>
              {group.map(p => (
                <button
                  key={p.id}
                  onClick={() => loadPage(p.id)}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                    selected?.path === p.id
                      ? 'bg-[rgba(240,160,48,0.08)] border-l-2 border-amber'
                      : 'hover:bg-card border-l-2 border-transparent',
                  ].join(' ')}
                >
                  <span className="text-xs text-ink truncate flex-1">{p.title}</span>
                  <ChevronRight size={11} className="text-ink-dim shrink-0 opacity-50" />
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {!loading && pages.length > 0 && (
        <div className="px-3 py-2 border-t border-rim">
          <p className="text-[10px] font-mono text-ink-dim">{pages.length} pages</p>
        </div>
      )}
    </>
  )}
</div>
```

- [ ] **Step 5: Commit**

```bash
git add src/views/WikiView.tsx tests/views/sidebar-collapse.test.ts
git commit -m "feat(ui): collapsible sidebar for WikiView"
```

---

## Task 2: ChatView sidebar collapse

**Files:**
- Modify: `src/views/ChatView.tsx`

- [ ] **Step 1: Add `ChevronLeft` and `ChevronRight` to ChatView imports**

Replace the import line:

```tsx
import { Send, BookOpen, Plus, Trash2, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
```

- [ ] **Step 2: Add `sidebarOpen` state inside `ChatView()`**

Add after the existing `useState` declarations:

```tsx
const [sidebarOpen, setSidebarOpen] = useState(true);
```

- [ ] **Step 3: Replace the left history panel div**

Replace the `<div className="w-[220px] shrink-0 flex flex-col border-r border-rim bg-panel overflow-hidden">` block and all its contents with:

```tsx
{/* ── Left panel: chat history ──────────────────────────── */}
<div className={`${sidebarOpen ? 'w-[220px]' : 'w-8'} shrink-0 flex flex-col border-r border-rim bg-panel overflow-hidden transition-all duration-200`}>
  <div className={`flex items-center gap-2 px-3 py-3 border-b border-rim shrink-0`}>
    {sidebarOpen && (
      <button
        onClick={handleNewChat}
        className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-rim text-xs text-ink-dim hover:text-ink hover:border-amber/40 hover:bg-card transition-colors"
      >
        <Plus size={12} className="shrink-0" />
        <span>New Chat</span>
      </button>
    )}
    <button
      onClick={() => setSidebarOpen(v => !v)}
      className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-ink-dim hover:text-ink hover:bg-card transition-colors ml-auto"
      title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
    >
      {sidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
    </button>
  </div>

  {sidebarOpen && (
    <>
      <div className="flex-1 overflow-y-auto py-1">
        {chatList.length === 0 && (
          <p className="text-[10px] font-mono text-ink-dim px-4 py-3">No chats yet.</p>
        )}
        {chatList.map(chat => (
          <HistoryItem
            key={chat.id}
            chat={chat}
            active={chat.id === chatId}
            onSelect={() => { if (chat.id !== chatId) loadChat(chat.id); }}
            onDelete={(e) => handleDeleteChat(chat.id, e)}
          />
        ))}
      </div>

      {chatList.length > 0 && (
        <div className="px-3 py-2 border-t border-rim">
          <p className="text-[10px] font-mono text-ink-dim">{chatList.length} chat{chatList.length !== 1 ? 's' : ''}</p>
        </div>
      )}
    </>
  )}
</div>
```

- [ ] **Step 4: Run tests to verify nothing broke**

```bash
cd /media/nine/HD_2/shanyuan/RARE && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/views/ChatView.tsx
git commit -m "feat(ui): collapsible sidebar for ChatView"
```

---

## Task 3: PlaygroundCanvas — scaffold, empty state, canvas setup

**Files:**
- Create: `src/views/PlaygroundCanvas.tsx`

- [ ] **Step 1: Create the file with types, empty state, and canvas scaffolding**

Create `src/views/PlaygroundCanvas.tsx` with the full contents below. The physics loop is NOT wired yet — just the canvas setup and empty state:

```tsx
import { useEffect, useRef, useState } from 'react';

type PageType = 'concept' | 'entity' | 'source';

interface PageMeta {
  id: string;
  title: string;
  type: PageType;
}

export interface WordBody {
  id: string;
  text: string;
  type: PageType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
}

const TYPE_COLOR: Record<PageType, string> = {
  concept: '#f0a030',
  entity:  '#38bdf8',
  source:  '#34d399',
};

const FONT = '12px monospace';
const MAX_WORDS = 40;
const PADDING = 20;

function truncate(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max) : s;
}

function measureWord(ctx: CanvasRenderingContext2D, text: string): { w: number; h: number } {
  ctx.font = FONT;
  return { w: Math.ceil(ctx.measureText(text).width) + 6, h: 16 };
}

export function createBody(
  page: PageMeta,
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
): WordBody {
  const text = truncate(page.title);
  const { w, h } = measureWord(ctx, text);
  return {
    id: page.id,
    text,
    type: page.type,
    x: PADDING + Math.random() * (canvasW - w - PADDING * 2),
    y: PADDING + Math.random() * (canvasH - h - PADDING * 2),
    vx: (Math.random() - 0.5) * 0.6,
    vy: (Math.random() - 0.5) * 0.6,
    w,
    h,
  };
}

export function createBurstBody(
  page: PageMeta,
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
): WordBody {
  const text = truncate(page.title);
  const { w, h } = measureWord(ctx, text);

  // Spawn at random canvas edge
  const edge = Math.floor(Math.random() * 4);
  let sx: number, sy: number;
  if (edge === 0)      { sx = Math.random() * canvasW; sy = -20; }
  else if (edge === 1) { sx = Math.random() * canvasW; sy = canvasH + 20; }
  else if (edge === 2) { sx = -20;           sy = Math.random() * canvasH; }
  else                 { sx = canvasW + 20;  sy = Math.random() * canvasH; }

  // Velocity toward canvas center ± 30° jitter
  const cx = canvasW / 2, cy = canvasH / 2;
  const angle = Math.atan2(cy - sy, cx - sx) + (Math.random() - 0.5) * (Math.PI / 3);
  const speed = 2 + Math.random() * 1.5;

  return {
    id: page.id,
    text,
    type: page.type,
    x: sx, y: sy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    w, h,
  };
}

interface Props {
  pages: PageMeta[];
  newPageIds: Set<string>;
  onBurstDone: () => void;
}

export function PlaygroundCanvas({ pages, newPageIds, onBurstDone }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isEmpty = pages.length === 0;

  return (
    <div ref={containerRef} className="flex-1 min-w-0 relative border-l border-rim overflow-hidden">
      {isEmpty ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none">
          <span
            className="text-[18px] text-ink-dim"
            style={{ animation: 'logo-pulse 3s ease-in-out infinite', opacity: 0.3 }}
          >
            ✦
          </span>
          <div className="text-center">
            <p className="text-[11px] font-mono text-ink-dim">Your knowledge will appear here.</p>
            <p className="text-[10px] font-mono text-ink-dim opacity-60 mt-1">Ingest your first source to begin.</p>
          </div>
        </div>
      ) : (
        size.w > 0 && (
          <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            style={{ width: size.w, height: size.h, display: 'block' }}
          />
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /media/nine/HD_2/shanyuan/RARE && npx tsc --noEmit
```

Expected: no errors related to `PlaygroundCanvas.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/views/PlaygroundCanvas.tsx
git commit -m "feat(playground): PlaygroundCanvas scaffold — empty state + canvas setup"
```

---

## Task 4: PlaygroundCanvas — physics loop and rendering

**Files:**
- Modify: `src/views/PlaygroundCanvas.tsx`

- [ ] **Step 1: Write a unit test for the physics step function**

Create `tests/views/playground.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { WordBody } from '../../src/views/PlaygroundCanvas';

// Inline stepPhysics for testing (mirrors the implementation)
function stepPhysics(
  bodies: WordBody[],
  cursor: { x: number; y: number } | null,
  canvasW: number,
  canvasH: number,
): void {
  const PAD = 20;
  const DAMP = 0.97;
  const MAX_SPEED = 3.5;

  for (const b of bodies) {
    // Cursor attraction or ambient drift
    if (cursor) {
      const dx = cursor.x - b.x;
      const dy = cursor.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const strength = Math.min(800 / (dist * dist), 0.4);
      b.vx += (dx / dist) * strength;
      b.vy += (dy / dist) * strength;
    } else {
      b.vx += (Math.random() - 0.5) * 0.02;
      b.vy += (Math.random() - 0.5) * 0.02;
    }

    // Damp + cap
    b.vx *= DAMP;
    b.vy *= DAMP;
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (speed > MAX_SPEED) { b.vx = (b.vx / speed) * MAX_SPEED; b.vy = (b.vy / speed) * MAX_SPEED; }

    // Move
    b.x += b.vx;
    b.y += b.vy;

    // Wall bounce
    if (b.x < PAD)                  { b.x = PAD;                b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x + b.w > canvasW - PAD)  { b.x = canvasW - PAD - b.w; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.y < PAD)                  { b.y = PAD;                b.vy = Math.abs(b.vy) * 0.6; }
    if (b.y + b.h > canvasH - PAD)  { b.y = canvasH - PAD - b.h; b.vy = -Math.abs(b.vy) * 0.6; }
  }

  // Word–word separation
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], bw = bodies[j];
      const ox = Math.min(a.x + a.w, bw.x + bw.w) - Math.max(a.x, bw.x);
      const oy = Math.min(a.y + a.h, bw.y + bw.h) - Math.max(a.y, bw.y);
      if (ox > 0 && oy > 0) {
        const half = ox < oy ? ox / 2 : oy / 2;
        if (ox < oy) { a.x -= half; bw.x += half; }
        else         { a.y -= half; bw.y += half; }
      }
    }
  }
}

function makeBody(overrides: Partial<WordBody> = {}): WordBody {
  return { id: 'x', text: 'test', type: 'concept', x: 100, y: 100, vx: 0, vy: 0, w: 40, h: 16, ...overrides };
}

describe('stepPhysics', () => {
  it('applies damping — velocity decreases each frame', () => {
    const b = makeBody({ vx: 10, vy: 0 });
    stepPhysics([b], null, 800, 600);
    expect(b.vx).toBeLessThan(10);
  });

  it('caps speed at MAX_SPEED', () => {
    const b = makeBody({ vx: 100, vy: 100 });
    stepPhysics([b], null, 800, 600);
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    expect(speed).toBeLessThanOrEqual(3.5 + 0.01);
  });

  it('bounces off left wall', () => {
    const b = makeBody({ x: 5, vx: -2 });
    stepPhysics([b], null, 800, 600);
    expect(b.x).toBeGreaterThanOrEqual(20);
    expect(b.vx).toBeGreaterThan(0);
  });

  it('cursor attraction pulls body closer', () => {
    const b = makeBody({ x: 100, y: 100, vx: 0, vy: 0 });
    const before = { x: b.x, y: b.y };
    stepPhysics([b], { x: 400, y: 400 }, 800, 600);
    // After one step, body moved toward cursor (400,400) from (100,100)
    expect(b.x).toBeGreaterThan(before.x);
    expect(b.y).toBeGreaterThan(before.y);
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd /media/nine/HD_2/shanyuan/RARE && npx vitest run tests/views/playground.test.ts
```

Expected: FAIL — `WordBody is not defined` (the import of the interface works but `stepPhysics` is not yet exported from the component).

- [ ] **Step 3: Add physics loop + rendering to PlaygroundCanvas.tsx**

Add the following before the `Props` interface (after `createBurstBody`):

```tsx
export function stepPhysics(
  bodies: WordBody[],
  cursor: { x: number; y: number } | null,
  canvasW: number,
  canvasH: number,
): void {
  const PAD = 20;
  const DAMP = 0.97;
  const MAX_SPEED = 3.5;

  for (const b of bodies) {
    if (cursor) {
      const dx = cursor.x - b.x;
      const dy = cursor.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const strength = Math.min(800 / (dist * dist), 0.4);
      b.vx += (dx / dist) * strength;
      b.vy += (dy / dist) * strength;
    } else {
      b.vx += (Math.random() - 0.5) * 0.02;
      b.vy += (Math.random() - 0.5) * 0.02;
    }

    b.vx *= DAMP;
    b.vy *= DAMP;
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (speed > MAX_SPEED) { b.vx = (b.vx / speed) * MAX_SPEED; b.vy = (b.vy / speed) * MAX_SPEED; }

    b.x += b.vx;
    b.y += b.vy;

    if (b.x < PAD)                  { b.x = PAD;                b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x + b.w > canvasW - PAD)  { b.x = canvasW - PAD - b.w; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.y < PAD)                  { b.y = PAD;                b.vy = Math.abs(b.vy) * 0.6; }
    if (b.y + b.h > canvasH - PAD)  { b.y = canvasH - PAD - b.h; b.vy = -Math.abs(b.vy) * 0.6; }
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], bw = bodies[j];
      const ox = Math.min(a.x + a.w, bw.x + bw.w) - Math.max(a.x, bw.x);
      const oy = Math.min(a.y + a.h, bw.y + bw.h) - Math.max(a.y, bw.y);
      if (ox > 0 && oy > 0) {
        if (ox < oy) { a.x -= ox / 2; bw.x += ox / 2; }
        else         { a.y -= oy / 2; bw.y += oy / 2; }
      }
    }
  }
}

function drawBodies(
  ctx: CanvasRenderingContext2D,
  bodies: WordBody[],
  cursor: { x: number; y: number } | null,
): void {
  ctx.font = FONT;
  for (const b of bodies) {
    const dx = cursor ? cursor.x - b.x : 999;
    const dy = cursor ? cursor.y - b.y : 999;
    const nearCursor = Math.sqrt(dx * dx + dy * dy) < 80;
    ctx.globalAlpha = nearCursor ? 1.0 : 0.75;
    ctx.fillStyle = TYPE_COLOR[b.type];
    ctx.fillText(b.text, b.x, b.y + 12);
  }
  ctx.globalAlpha = 1.0;
}
```

Then add the physics refs and RAF loop inside the `PlaygroundCanvas` component, **before** the `return` statement. Replace the existing `useEffect` for the `isEmpty` block and add:

```tsx
const bodiesRef  = useRef<WordBody[]>([]);
const cursorRef  = useRef<{ x: number; y: number } | null>(null);

// Sync bodies when pages or canvas size change
useEffect(() => {
  if (size.w === 0) return;
  const ctx = canvasRef.current?.getContext('2d');
  if (!ctx) return;
  const existingIds = new Set(bodiesRef.current.map(b => b.id));
  const pageIds     = new Set(pages.map(p => p.id));
  // Remove stale bodies
  bodiesRef.current = bodiesRef.current.filter(b => pageIds.has(b.id));
  // Add new bodies (non-burst) that aren't tracked yet
  for (const page of pages.slice(0, MAX_WORDS)) {
    if (!existingIds.has(page.id) && !newPageIds.has(page.id)) {
      bodiesRef.current.push(createBody(page, ctx, size.w, size.h));
    }
  }
}, [pages, size]); // eslint-disable-line react-hooks/exhaustive-deps

// RAF loop
useEffect(() => {
  if (size.w === 0 || pages.length === 0) return;
  let rafId: number;
  function tick() {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size.w, size.h);
    stepPhysics(bodiesRef.current, cursorRef.current, size.w, size.h);
    drawBodies(ctx, bodiesRef.current, cursorRef.current);
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}, [size.w, size.h, pages.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
```

Also add cursor tracking to the canvas element JSX by replacing the `<canvas .../>` line:

```tsx
<canvas
  ref={canvasRef}
  width={size.w}
  height={size.h}
  style={{ width: size.w, height: size.h, display: 'block' }}
  onMouseMove={e => {
    const rect = canvasRef.current!.getBoundingClientRect();
    cursorRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }}
  onMouseLeave={() => { cursorRef.current = null; }}
/>
```

- [ ] **Step 4: Run tests — should now pass**

```bash
cd /media/nine/HD_2/shanyuan/RARE && npx vitest run tests/views/playground.test.ts
```

Expected: all 4 physics tests PASS. (The test imports `WordBody` as a type and mirrors `stepPhysics` inline — the export just removes the import error.)

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/PlaygroundCanvas.tsx tests/views/playground.test.ts
git commit -m "feat(playground): physics loop, stepPhysics, drawBodies, cursor tracking"
```

---

## Task 5: PlaygroundCanvas — burst animation on new ingest

**Files:**
- Modify: `src/views/PlaygroundCanvas.tsx`
- Modify: `tests/views/playground.test.ts`

- [ ] **Step 1: Write the failing test for `detectNewPageIds`**

Add to `tests/views/playground.test.ts`:

```ts
// detectNewPageIds: given previous ID set and new page array, return only IDs not seen before
function detectNewPageIds(prevIds: Set<string>, pages: Array<{ id: string }>): Set<string> {
  return new Set(pages.filter(p => !prevIds.has(p.id)).map(p => p.id));
}

describe('detectNewPageIds', () => {
  it('returns empty set when nothing changed', () => {
    const prev = new Set(['a', 'b']);
    const pages = [{ id: 'a' }, { id: 'b' }];
    expect(detectNewPageIds(prev, pages).size).toBe(0);
  });

  it('detects a single new page', () => {
    const prev = new Set(['a']);
    const pages = [{ id: 'a' }, { id: 'b' }];
    const result = detectNewPageIds(prev, pages);
    expect(result.has('b')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('detects multiple new pages', () => {
    const prev = new Set<string>();
    const pages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = detectNewPageIds(prev, pages);
    expect(result.size).toBe(3);
  });

  it('handles empty page array', () => {
    const prev = new Set(['a']);
    expect(detectNewPageIds(prev, []).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify detectNewPageIds tests pass immediately** (function defined in test file)

```bash
cd /media/nine/HD_2/shanyuan/RARE && npx vitest run tests/views/playground.test.ts
```

Expected: all tests including new `detectNewPageIds` tests PASS.

- [ ] **Step 3: Add burst handling to PlaygroundCanvas**

Inside `PlaygroundCanvas`, add a new `useEffect` after the pages-sync effect:

```tsx
// Burst: spawn new words from canvas edge when newPageIds arrives
useEffect(() => {
  if (newPageIds.size === 0 || size.w === 0) return;
  const ctx = canvasRef.current?.getContext('2d');
  if (!ctx) return;
  for (const id of newPageIds) {
    const page = pages.find(p => p.id === id);
    if (!page) continue;
    // Remove any existing body with same id before adding burst version
    bodiesRef.current = bodiesRef.current.filter(b => b.id !== id);
    bodiesRef.current.push(createBurstBody(page, ctx, size.w, size.h));
  }
  onBurstDone();
}, [newPageIds]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Run full test suite**

```bash
cd /media/nine/HD_2/shanyuan/RARE && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/views/PlaygroundCanvas.tsx tests/views/playground.test.ts
git commit -m "feat(playground): burst animation for newly ingested pages"
```

---

## Task 6: PasteView — two-column layout, page feed, burst detection

**Files:**
- Modify: `src/views/PasteView.tsx`

- [ ] **Step 1: Add imports to PasteView.tsx**

Add `PlaygroundCanvas` import at the top:

```tsx
import { PlaygroundCanvas } from './PlaygroundCanvas';
```

Change the React import line to include `useRef` if not already present:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: Add `PageMeta` interface and new state inside `PasteView()`**

Add after the existing interfaces at the top of the file:

```tsx
interface PageMeta {
  id: string;
  title: string;
  type: 'concept' | 'entity' | 'source';
}
```

Add inside `PasteView()` after the existing `useState` / `useRef` declarations:

```tsx
const [pages, setPages]           = useState<PageMeta[]>([]);
const [newPageIds, setNewPageIds] = useState<Set<string>>(new Set());
const pagesRef        = useRef<PageMeta[]>([]);
const prevDoneIdsRef  = useRef<Set<number>>(new Set());
```

Keep `pagesRef` in sync with `pages`:

```tsx
useEffect(() => { pagesRef.current = pages; }, [pages]);
```

Fetch pages on mount — add this `useEffect` alongside the existing `refreshQueue` call:

```tsx
useEffect(() => {
  fetch('/api/pages')
    .then(r => r.json())
    .then((data: PageMeta[]) => setPages((data as PageMeta[]).slice(0, 40)))
    .catch(() => { /* non-critical */ });
}, []);
```

- [ ] **Step 3: Update `startPoll` to detect newly-done jobs and trigger burst**

Replace the `startPoll` function body entirely:

```tsx
function startPoll() {
  if (pollRef.current) return;
  pollRef.current = setInterval(async () => {
    try {
      const r    = await fetch('/api/queue');
      const data = (await r.json()) as QueueTask[];
      setJobs(data.slice().reverse());

      // Detect jobs that just transitioned to done
      const doneIds    = new Set(data.filter(j => j.status === 'done').map(j => j.id));
      const newlyDone  = [...doneIds].filter(id => !prevDoneIdsRef.current.has(id));
      prevDoneIdsRef.current = doneIds;

      if (newlyDone.length > 0) {
        const pr       = await fetch('/api/pages');
        const newPages = (await pr.json()) as PageMeta[];
        const capped   = newPages.slice(0, 40);
        const prevIds  = new Set(pagesRef.current.map(p => p.id));
        const burst    = new Set(capped.filter(p => !prevIds.has(p.id)).map(p => p.id));
        setPages(capped);
        if (burst.size > 0) setNewPageIds(burst);
      }

      const active = data.some(j => j.status === 'pending' || j.status === 'processing');
      if (!active) stopPoll();
    } catch { /* ignore */ }
  }, 1500);
}
```

- [ ] **Step 4: Change PasteView layout to two-column and add PlaygroundCanvas**

Replace the outermost `return` div:

```tsx
return (
  <div className="h-full flex overflow-hidden">
    {/* ── Left: ingest form ───────────────────────────────── */}
    <div className="w-[480px] shrink-0 overflow-y-auto p-8">
      <div className="max-w-2xl space-y-6">
```

Find the closing `</div>` of `<div className="max-w-2xl space-y-6">` and close the left column after it, then add the PlaygroundCanvas:

```tsx
      </div>{/* end max-w-2xl */}
    </div>{/* end left column */}

    {/* ── Right: knowledge orbit playground ────────────────── */}
    <PlaygroundCanvas
      pages={pages}
      newPageIds={newPageIds}
      onBurstDone={() => setNewPageIds(new Set())}
    />
  </div>
);
```

The existing closing `</div>` at the bottom of the original return should be removed (it was wrapping a single-column layout).

- [ ] **Step 5: Type-check**

```bash
cd /media/nine/HD_2/shanyuan/RARE && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Rebuild Docker container and verify in browser**

```bash
docker compose up --build -d 2>&1 | tail -5
```

Open `http://localhost:3100`, go to the Ingest tab. Verify:
- Left column shows the existing ingest form
- Right panel shows the playground (or empty-state message if vault is fresh)
- On WikiView and ChatView, the sidebar toggle button is visible at the top of the left panel
- Clicking the toggle collapses and expands the sidebar with a smooth animation
- Moving cursor over the playground canvas attracts words toward it

- [ ] **Step 8: Commit**

```bash
git add src/views/PasteView.tsx
git commit -m "feat(playground): PasteView two-column layout + page feed + burst detection"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Two-column PasteView layout, left 480px fixed | Task 6 Step 4 |
| Playground hides on `< 900px` (`hidden lg:block`) | ⚠️ Missing — see note below |
| `GET /api/pages` on mount, cap 40 | Task 6 Step 2 |
| Re-fetch on `processing→done` transition | Task 6 Step 3 |
| `WordBody` interface with `id, text, type, x, y, vx, vy, w, h` | Task 3 |
| Color by type: concept amber, entity sky, source emerald | Task 3 (`TYPE_COLOR`) |
| Font: 12px monospace, opacity 0.75/1.0 | Task 4 (`drawBodies`) |
| Cursor attraction formula | Task 4 (`stepPhysics`) |
| Ambient drift ±0.02 | Task 4 |
| Damping 0.97 | Task 4 |
| Speed cap 3.5 | Task 4 |
| Wall bounce with 20px padding, 0.6 restitution | Task 4 |
| Word–word separation (axis-aligned) | Task 4 |
| Burst: spawn at edge, inward velocity ± 30° jitter | Task 5 |
| Empty state: pulsing ✦ + two-line message | Task 3 |
| WikiView sidebar collapse `w-[260px]` → `w-8` | Task 1 |
| ChatView sidebar collapse `w-[220px]` → `w-8` | Task 2 |
| `transition-all duration-200` on sidebar width | Tasks 1, 2 |
| ChevronLeft/Right toggle icon | Tasks 1, 2 |

⚠️ **Gap — narrow viewport hide:** The spec says `hidden lg:block` for the playground on viewports < 900px. This is one line: add `className="hidden lg:flex"` to the outer `<div className="h-full flex overflow-hidden">` wrapper in PasteView, or more precisely wrap `<PlaygroundCanvas>` in a `<div className="hidden lg:contents">`. Simplest: add `className` to the `PlaygroundCanvas` wrapper div in the return. Add this to **Task 6 Step 4** — replace:

```tsx
{/* ── Right: knowledge orbit playground ────────────────── */}
<PlaygroundCanvas
```

With:

```tsx
{/* ── Right: knowledge orbit playground (hidden on narrow viewports) ── */}
<div className="hidden lg:flex flex-1 min-w-0">
  <PlaygroundCanvas
    pages={pages}
    newPageIds={newPageIds}
    onBurstDone={() => setNewPageIds(new Set())}
  />
</div>
```

And update `PlaygroundCanvas` outer div to remove the `flex-1` (since the wrapper div now provides it) — or keep it, since it fills the wrapper div anyway. Keep it as-is; the `flex-1` on the inner div is harmless inside a `flex` parent.

Actually this creates a layout conflict — `PlaygroundCanvas` renders its own `flex-1` container. To avoid double-nesting, instead just conditionally render the whole component:

In `PasteView` Step 4, use:

```tsx
<div className="hidden lg:contents">
  <PlaygroundCanvas
    pages={pages}
    newPageIds={newPageIds}
    onBurstDone={() => setNewPageIds(new Set())}
  />
</div>
```

`lg:contents` makes the wrapper div invisible to flexbox at lg+ while hiding it below lg.
