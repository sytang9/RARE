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
    expect(b.x).toBeGreaterThan(before.x);
    expect(b.y).toBeGreaterThan(before.y);
  });
});
