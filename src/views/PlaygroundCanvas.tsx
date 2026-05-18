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

// Used in Task 4 physics render loop; declared here for co-location with types
export const TYPE_COLOR: Record<PageType, string> = {
  concept: '#f0a030',
  entity:  '#38bdf8',
  source:  '#34d399',
};

const FONT = '12px monospace';
// Used in Task 4 physics loop to cap word count
export const MAX_WORDS = 40;
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

  const edge = Math.floor(Math.random() * 4);
  let sx: number, sy: number;
  if (edge === 0)      { sx = Math.random() * canvasW; sy = -20; }
  else if (edge === 1) { sx = Math.random() * canvasW; sy = canvasH + 20; }
  else if (edge === 2) { sx = -20;           sy = Math.random() * canvasH; }
  else                 { sx = canvasW + 20;  sy = Math.random() * canvasH; }

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

interface Props {
  pages: PageMeta[];
  newPageIds: Set<string>;
  onBurstDone: () => void;
}

export function PlaygroundCanvas({ pages, newPageIds, onBurstDone }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

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

  const bodiesRef = useRef<WordBody[]>([]);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);

  // Sync bodies when pages or canvas size change
  useEffect(() => {
    if (size.w === 0) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const existingIds = new Set(bodiesRef.current.map(b => b.id));
    const pageIds     = new Set(pages.map(p => p.id));
    bodiesRef.current = bodiesRef.current.filter(b => pageIds.has(b.id));
    for (const page of pages.slice(0, MAX_WORDS)) {
      if (!existingIds.has(page.id) && !newPageIds.has(page.id)) {
        bodiesRef.current.push(createBody(page, ctx, size.w, size.h));
      }
    }
  }, [pages, size]); // eslint-disable-line react-hooks/exhaustive-deps

  // Burst: spawn new words from canvas edge when newPageIds arrives
  useEffect(() => {
    if (newPageIds.size === 0 || size.w === 0) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    for (const id of newPageIds) {
      const page = pages.find(p => p.id === id);
      if (!page) continue;
      bodiesRef.current = bodiesRef.current.filter(b => b.id !== id);
      bodiesRef.current.push(createBurstBody(page, ctx, size.w, size.h));
    }
    onBurstDone();
  }, [newPageIds]); // eslint-disable-line react-hooks/exhaustive-deps

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
            onMouseMove={e => {
              const rect = canvasRef.current!.getBoundingClientRect();
              cursorRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            }}
            onMouseLeave={() => { cursorRef.current = null; }}
          />
        )
      )}
    </div>
  );
}
