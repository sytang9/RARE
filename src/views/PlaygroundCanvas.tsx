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

interface Star {
  x: number;
  y: number;
  r: number;
  opacity: number;
  twinkleOffset: number;
}

export const TYPE_COLOR: Record<PageType, string> = {
  concept: '#f0a030',
  entity:  '#38bdf8',
  source:  '#34d399',
};

const FONT = '11px monospace';
export const MAX_WORDS = 40;
const PADDING = 24;
const BG_COLOR = '#060612';
const STAR_COUNT = 120;
const CONSTELLATION_DIST = 130;

function truncate(s: string, max = 22): string {
  return s.length > max ? s.slice(0, max) : s;
}

function measureWord(ctx: CanvasRenderingContext2D, text: string): { w: number; h: number } {
  ctx.font = FONT;
  return { w: Math.ceil(ctx.measureText(text).width) + 8, h: 14 };
}

function generateStars(w: number, h: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.2,
      opacity: Math.random() * 0.6 + 0.2,
      twinkleOffset: Math.random() * Math.PI * 2,
    });
  }
  return stars;
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
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
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
  const speed = 1.5 + Math.random() * 1.2;

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
  const PAD = PADDING;
  const DAMP = 0.97;
  const MAX_SPEED = 3.0;

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

function drawScene(
  ctx: CanvasRenderingContext2D,
  bodies: WordBody[],
  stars: Star[],
  cursor: { x: number; y: number } | null,
  canvasW: number,
  canvasH: number,
  tick: number,
): void {
  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Starfield
  for (const s of stars) {
    const twinkle = 0.5 + 0.5 * Math.sin(tick * 0.02 + s.twinkleOffset);
    ctx.globalAlpha = s.opacity * (0.6 + 0.4 * twinkle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Constellation lines between nearby bodies
  ctx.lineWidth = 0.5;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
      const bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const dist = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
      if (dist < CONSTELLATION_DIST) {
        const alpha = (1 - dist / CONSTELLATION_DIST) * 0.25;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#8899cc';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;

  // Word nodes
  ctx.font = FONT;
  for (const b of bodies) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const color = TYPE_COLOR[b.type];

    const dx = cursor ? cursor.x - cx : 9999;
    const dy = cursor ? cursor.y - cy : 9999;
    const nearCursor = Math.sqrt(dx * dx + dy * dy) < 90;
    const alpha = nearCursor ? 1.0 : 0.8;

    // Glow dot
    ctx.globalAlpha = alpha * 0.9;
    ctx.shadowBlur = nearCursor ? 10 : 6;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, nearCursor ? 2.5 : 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Text label
    ctx.shadowBlur = nearCursor ? 8 : 0;
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = color;
    ctx.fillText(b.text, b.x + 4, b.y + 10);

    ctx.shadowBlur = 0;
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
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
  const starsRef  = useRef<Star[]>([]);
  const tickRef   = useRef(0);

  // Regenerate stars when canvas size changes
  useEffect(() => {
    if (size.w > 0 && size.h > 0) {
      starsRef.current = generateStars(size.w, size.h);
    }
  }, [size.w, size.h]);

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
      tickRef.current += 1;
      stepPhysics(bodiesRef.current, cursorRef.current, size.w, size.h);
      drawScene(ctx, bodiesRef.current, starsRef.current, cursorRef.current, size.w, size.h, tickRef.current);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [size.w, size.h, pages.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEmpty = pages.length === 0;

  return (
    <div ref={containerRef} className="w-full h-full relative border-l border-rim overflow-hidden">
      {isEmpty ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none"
          style={{ background: BG_COLOR }}
        >
          <span
            className="text-[18px]"
            style={{ animation: 'logo-pulse 3s ease-in-out infinite', opacity: 0.25, color: '#8899cc' }}
          >
            ✦
          </span>
          <div className="text-center">
            <p className="text-[10px] font-mono" style={{ color: '#3a3a5c' }}>Your knowledge will appear here.</p>
            <p className="text-[9px] font-mono mt-1" style={{ color: '#2a2a42' }}>Ingest your first source to begin.</p>
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
