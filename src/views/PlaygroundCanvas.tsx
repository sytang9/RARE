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

interface Props {
  pages: PageMeta[];
  newPageIds: Set<string>;
  onBurstDone: () => void;
}

// newPageIds and onBurstDone wired in Task 5
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PlaygroundCanvas({ pages, newPageIds: _newPageIds, onBurstDone: _onBurstDone }: Props) {
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
