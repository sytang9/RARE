# RARE UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Q2–Q8 from the UX improvements spec: graph collision, model switching with extended thinking, wiki width/wikilink fix, cost-per-source, cost breakdown dashboard, and vision PDF ingestion.

**Architecture:** All changes layer on the existing Express + React stack with no new dependencies. New API endpoints (`/api/costs`, `/api/costs/sources`) parse `log.md` on the server side. Vision PDF stores raw PDF bytes at `raw/sources/<slug>.pdf` and uses the Anthropic native document block in the analyze step; text-mode PDFs continue using the existing `.md` path.

**Tech Stack:** React 19 + TypeScript, Express, Anthropic SDK, `react-force-graph-2d`, `pdf-parse`, Vitest.

---

## File Map

| File | Change |
|------|--------|
| `src/llm/cost.ts` | Add `'opus'` to `ModelTier`, add opus pricing |
| `src/llm/anthropic.ts` | Add opus to `MODEL_IDS`; add `thinking` to `ChatOptions` |
| `src/chat/answer.ts` | Accept `model` + `thinking` opts, forward to `chat()` |
| `src/state/chatStore.ts` | Pass `model` + `thinking` to POST /api/chat |
| `src/views/ChatView.tsx` | Model pill (Haiku/Sonnet/Opus) + THINK toggle in header |
| `src/views/GraphView.tsx` | Add `d3ForceCollide` prop, tune `d3AlphaDecay` + `d3VelocityDecay` |
| `src/views/WikiView.tsx` | Fix `startsWith('wiki:')` → `includes('wiki:')` bug; widen to `max-w-4xl` |
| `src/lib/cost.ts` | Add `parseCostLog()` |
| `src/views/SourcesView.tsx` | Fetch `/api/costs/sources`, show cost badge on each card |
| `src/views/SettingsView.tsx` | Replace monthly total with full cost breakdown section |
| `src/sources/pdf.ts` | Add `pdfToDocumentBlock()` |
| `src/ingest/analyze.ts` | `sourceContent: string \| DocumentBlock` union |
| `src/ingest/orchestrate.ts` | Detect `.pdf` rawPath → vision path |
| `src/views/PasteView.tsx` | Vision mode toggle below PDF drop zone |
| `server.ts` | Add `GET /api/costs`, `GET /api/costs/sources`; update `POST /api/chat`, `POST /api/ingest/upload` |

---

## Task 1: Extend `ModelTier` and `computeUsd` for Opus

**Files:**
- Modify: `src/llm/cost.ts`
- Test: `tests/llm/cost.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/llm/cost.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeUsd, ModelTier } from '../../src/llm/cost';

describe('llm.cost.computeUsd', () => {
  it('computes haiku cost correctly', () => {
    expect(computeUsd('haiku', { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(6.0, 4);
  });

  it('computes opus cost correctly', () => {
    expect(computeUsd('opus', { input: 1_000_000, output: 1_000_000 })).toBeCloseTo(90.0, 4);
  });

  it('ModelTier includes opus', () => {
    const tier: ModelTier = 'opus';
    expect(tier).toBe('opus');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /media/nine/HD_2/shanyuan/RARE/.claude/worktrees/v1-implementation
npx vitest run tests/llm/cost.test.ts
```

Expected: FAIL — `'opus'` not in `ModelTier`, no opus pricing entry.

- [ ] **Step 3: Update `src/llm/cost.ts`**

```ts
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

const PRICING: Record<ModelTier, { inputPerMtok: number; outputPerMtok: number }> = {
  haiku:  { inputPerMtok: 1,  outputPerMtok: 5   },
  sonnet: { inputPerMtok: 3,  outputPerMtok: 15  },
  opus:   { inputPerMtok: 15, outputPerMtok: 75  },
};

export function computeUsd(
  tier: ModelTier,
  tokens: { input: number; output: number },
): number {
  const p = PRICING[tier];
  const usd = (tokens.input / 1_000_000) * p.inputPerMtok
            + (tokens.output / 1_000_000) * p.outputPerMtok;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/llm/cost.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/cost.ts tests/llm/cost.test.ts
git commit -m "feat(llm): add opus tier to ModelTier and computeUsd"
```

---

## Task 2: Add Opus to anthropic.ts + `thinking` param

**Files:**
- Modify: `src/llm/anthropic.ts`
- Test: manual smoke test only (real-LLM gated)

- [ ] **Step 1: Update `src/llm/anthropic.ts`**

Replace the entire file:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { computeUsd, type ModelTier } from './cost';

let client: Anthropic | null = null;

const MODEL_IDS: Record<ModelTier, string> = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-7',
};

export { ModelTier };

export function initAnthropic(apiKey: string): void {
  client = new Anthropic({ apiKey });
}

export interface ChatOptions {
  model: ModelTier;
  system: string;
  messages: Anthropic.MessageParam[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];
  maxTokens?: number;
  thinking?: { type: 'enabled'; budget_tokens: number };
}

export interface ChatResult {
  text: string;
  toolUse?: { name: string; input: unknown };
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  if (!client) throw new Error('Anthropic client not initialized');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: MODEL_IDS[opts.model],
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools,
    max_tokens: opts.maxTokens ?? 4096,
  };
  if (opts.thinking) {
    params.thinking = opts.thinking;
    // thinking requires max_tokens > budget_tokens
    if (params.max_tokens <= opts.thinking.budget_tokens) {
      params.max_tokens = opts.thinking.budget_tokens + 2000;
    }
  }
  const resp = await client.messages.create(params);
  let text = '';
  let toolUse: ChatResult['toolUse'];
  for (const block of resp.content) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'tool_use') toolUse = { name: block.name, input: block.input };
    // thinking blocks are intentionally ignored
  }
  const inputTokens = resp.usage.input_tokens;
  const outputTokens = resp.usage.output_tokens;
  return {
    text, toolUse, inputTokens, outputTokens,
    usd: computeUsd(opts.model, { input: inputTokens, output: outputTokens }),
  };
}

export async function chatStream(
  opts: ChatOptions,
  onDelta: (chunk: string) => void,
): Promise<ChatResult> {
  if (!client) throw new Error('Anthropic client not initialized');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: MODEL_IDS[opts.model],
    system: opts.system,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 4096,
  };
  const stream = client.messages.stream(params);
  let text = '';
  stream.on('text', delta => { text += delta; onDelta(delta); });
  const final = await stream.finalMessage();
  return {
    text,
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
    usd: computeUsd(opts.model, {
      input: final.usage.input_tokens,
      output: final.usage.output_tokens,
    }),
  };
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/llm/anthropic.ts
git commit -m "feat(llm): add opus model and optional extended thinking to ChatOptions"
```

---

## Task 3: Thread model + thinking through answer.ts and chatStore

**Files:**
- Modify: `src/chat/answer.ts`
- Modify: `src/state/chatStore.ts`
- Test: `tests/chat/answer.test.ts` — update existing test

- [ ] **Step 1: Write the failing test (add model/thinking coverage)**

Open `tests/chat/answer.test.ts`. Find the mock for `chat` from `../../src/llm/anthropic`. Add a test that verifies model and thinking are forwarded:

```ts
it('forwards model and thinking to the LLM', async () => {
  const { answer } = await import('../../src/chat/answer');
  const { chat } = await import('../../src/llm/anthropic');
  const chatMock = vi.mocked(chat);
  chatMock.mockResolvedValueOnce({
    text: 'ok',
    inputTokens: 10,
    outputTokens: 5,
    usd: 0.001,
  });

  await answer('what is X?', [], vault, { model: 'opus', thinking: true });

  const callOpts = chatMock.mock.calls[chatMock.mock.calls.length - 1][0];
  expect(callOpts.model).toBe('opus');
  expect(callOpts.thinking).toEqual({ type: 'enabled', budget_tokens: 8000 });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/chat/answer.test.ts
```

Expected: FAIL — `answer` doesn't accept opts yet.

- [ ] **Step 3: Update `src/chat/answer.ts`**

```ts
import chatTemplate from '../../prompts/chat.md?raw';
import { chat, type ModelTier } from '../llm/anthropic';
import { findRelevantPages } from '../retrieve/findRelevantPages';
import { extractWikilinks } from '../vault/wikilinks';
import { appendLog } from '../vault/log';
import { readFileText } from '../lib/fs';
import { pathJoin } from '../lib/path';
import type { VaultRoot } from '../vault/root';

export interface Message { role: 'user' | 'assistant'; content: string; }

export interface AnswerOptions {
  model?: ModelTier;
  thinking?: boolean;
}

export interface AnswerResult {
  text: string;
  citations: string[];
  cost: { inputTokens: number; outputTokens: number; usd: number };
}

export async function answer(
  query: string,
  history: Message[],
  vault: VaultRoot,
  opts: AnswerOptions = {},
): Promise<AnswerResult> {
  const model: ModelTier = opts.model ?? 'sonnet';
  const thinking = opts.thinking === true && model !== 'haiku';

  const pages = await findRelevantPages(query, vault);
  const purpose = await safeRead(pathJoin(vault.root, 'purpose.md'));
  const pagesBlock = pages
    .map((p, i) => `[${i + 1}] ${p.path}\n${p.body}`)
    .join('\n\n---\n\n');
  const convBlock = history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const prompt = chatTemplate
    .replace('{{purpose}}', purpose)
    .replace('{{pages}}', pagesBlock)
    .replace('{{conversation}}', convBlock)
    .replace('{{query}}', query);

  const result = await chat({
    model,
    system: 'You are a careful, sourced research assistant.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2048,
    thinking: thinking ? { type: 'enabled', budget_tokens: 8000 } : undefined,
  });

  await appendLog(vault, {
    event: 'query',
    title: query.slice(0, 80),
    detail: {
      model,
      pages_read: pages.map(p => p.path),
      cost_usd: result.usd,
      tokens: { input: result.inputTokens, output: result.outputTokens },
    },
  });

  return {
    text: result.text,
    citations: extractWikilinks(result.text),
    cost: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, usd: result.usd },
  };
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFileText(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    if (typeof err === 'string' && err.includes('No such file')) return '';
    throw err;
  }
}
```

- [ ] **Step 4: Update `src/state/chatStore.ts`**

```ts
import { create } from 'zustand';

export interface Message { role: 'user' | 'assistant'; content: string; }

export interface SendOpts {
  model?: string;
  thinking?: boolean;
}

interface ChatState {
  messages: Message[];
  pending: boolean;
  send: (text: string, opts?: SendOpts) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  pending: false,
  async send(text, opts = {}) {
    set(s => ({ messages: [...s.messages, { role: 'user', content: text }], pending: true }));
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text,
          history: get().messages,
          model: opts.model ?? 'sonnet',
          thinking: opts.thinking ?? false,
        }),
      });
      const json = await r.json() as { text?: string; error?: string };
      if (!r.ok) throw new Error(json.error ?? 'Chat failed');
      set(s => ({
        messages: [...s.messages, { role: 'assistant', content: json.text ?? '' }],
        pending: false,
      }));
    } catch (err) {
      set(s => ({
        messages: [
          ...s.messages,
          { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'failed'}` },
        ],
        pending: false,
      }));
    }
  },
}));
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/chat/answer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/chat/answer.ts src/state/chatStore.ts
git commit -m "feat(chat): thread model and thinking opts through answer and chatStore"
```

---

## Task 4: Update server.ts — /api/chat reads model + thinking

**Files:**
- Modify: `server.ts` (POST /api/chat route only)

- [ ] **Step 1: Update the `/api/chat` route in `server.ts`**

Find and replace the existing `app.post('/api/chat', ...)` handler (around line 265):

```ts
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { query, history, model: rawModel, thinking: rawThinking } = req.body as {
      query?: string;
      history?: unknown[];
      model?: string;
      thinking?: boolean;
    };
    if (!query) return res.status(400).json({ error: 'query required' });
    const VALID_MODELS = ['haiku', 'sonnet', 'opus'] as const;
    const model = VALID_MODELS.includes(rawModel as typeof VALID_MODELS[number])
      ? (rawModel as typeof VALID_MODELS[number])
      : 'sonnet';
    const thinking = rawThinking === true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await answer(query, (history ?? []) as any, vault, { model, thinking });
    res.json({ text: result.text });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat(server): read model and thinking from POST /api/chat body"
```

---

## Task 5: ChatView model pill + THINK toggle

**Files:**
- Modify: `src/views/ChatView.tsx`

The spec layout:
```
[Chat]                    [Haiku] [Sonnet] [Opus]   [THINK ○/●]
```

- [ ] **Step 1: Replace `src/views/ChatView.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Send, BookOpen } from 'lucide-react';
import { useChatStore } from '../state/chatStore';

type ModelChoice = 'haiku' | 'sonnet' | 'opus';

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: 'var(--color-amber)',
            animation: `typing-pulse 1.4s ease-in-out ${i * 0.22}s infinite`,
            opacity: 0.2,
          }}
        />
      ))}
    </div>
  );
}

const MODEL_LABELS: Record<ModelChoice, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  opus: 'Opus',
};

export function ChatView() {
  const { messages, pending, send } = useChatStore();
  const [draft, setDraft]         = useState('');
  const [error, setError]         = useState('');
  const [model, setModel]         = useState<ModelChoice>('sonnet');
  const [thinking, setThinking]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

  // Haiku doesn't support extended thinking
  const thinkingDisabled = model === 'haiku';

  function selectModel(m: ModelChoice) {
    setModel(m);
    if (m === 'haiku') setThinking(false);
  }

  async function handleSend() {
    const q = draft.trim();
    if (!q || pending) return;
    setDraft('');
    setError('');
    try {
      await send(q, { model, thinking: thinking && model !== 'haiku' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      useChatStore.setState({ pending: false });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const empty = messages.length === 0 && !pending;

  return (
    <div className="h-full flex flex-col">
      {/* ── Header with model controls ───────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-rim bg-panel shrink-0">
        <span className="text-[13px] font-semibold text-ink">Chat</span>
        <div className="flex items-center gap-3">
          {/* Model pill */}
          <div className="flex bg-card border border-rim rounded-md overflow-hidden">
            {(['haiku', 'sonnet', 'opus'] as ModelChoice[]).map(m => (
              <button
                key={m}
                onClick={() => selectModel(m)}
                className={[
                  'px-3 py-1.5 text-[11px] font-mono transition-colors',
                  model === m
                    ? 'bg-amber text-black font-bold'
                    : 'text-ink-dim hover:text-ink hover:bg-card',
                ].join(' ')}
              >
                {MODEL_LABELS[m]}
              </button>
            ))}
          </div>
          {/* THINK toggle */}
          <div className={`flex items-center gap-2 ${thinkingDisabled ? 'opacity-35' : ''}`}>
            <span className="text-[10px] font-mono tracking-widest text-ink-dim">THINK</span>
            <button
              onClick={() => !thinkingDisabled && setThinking(t => !t)}
              disabled={thinkingDisabled}
              className="w-8 h-4.5 rounded-full relative transition-colors disabled:cursor-not-allowed"
              style={{
                background: thinking && !thinkingDisabled
                  ? 'var(--color-amber)'
                  : 'var(--color-card)',
                border: '1px solid var(--color-rim)',
                height: '18px',
                width: '32px',
              }}
              title={thinkingDisabled ? 'Extended thinking not available for Haiku' : 'Toggle extended thinking'}
            >
              <span
                className="absolute top-0.5 rounded-full bg-white transition-transform"
                style={{
                  width: '12px',
                  height: '12px',
                  top: '2px',
                  transform: thinking && !thinkingDisabled ? 'translateX(16px)' : 'translateX(2px)',
                  background: thinking && !thinkingDisabled ? '#000' : '#fff',
                }}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {empty ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center select-none">
            <BookOpen size={28} className="text-ink-dim opacity-40" />
            <p className="text-sm text-ink-dim">Ask anything about your knowledge base.</p>
            <p className="text-xs text-ink-dim opacity-60">Answers are grounded in your wiki pages.</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {messages.map((m, i) => {
              const isUser = m.role === 'user';
              return (
                <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={[
                      'max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed',
                      isUser
                        ? 'rounded-br-sm text-ink border border-amber/25'
                        : 'bg-card border border-rim text-ink rounded-bl-sm',
                    ].join(' ')}
                    style={isUser ? {
                      background: 'linear-gradient(135deg, rgba(240,160,48,0.13), rgba(240,160,48,0.05))',
                    } : undefined}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
            {pending && (
              <div className="flex justify-start">
                <div className="bg-card border border-rim rounded-xl rounded-bl-sm">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="px-6 py-2 text-xs text-red-400 border-t border-rim bg-red-900/10">
          {error}
        </div>
      )}

      <div className="border-t border-rim bg-panel px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the wiki…"
            rows={1}
            className={[
              'flex-1 bg-card border border-rim rounded-lg px-4 py-2.5 input-amber-focus',
              'text-sm text-ink placeholder:text-ink-dim',
              'resize-none min-h-[44px] max-h-[140px] overflow-y-auto',
            ].join(' ')}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || pending}
            className={[
              'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all',
              draft.trim() && !pending
                ? 'text-black hover:opacity-90 active:scale-95'
                : 'bg-card border border-rim text-ink-dim cursor-not-allowed',
            ].join(' ')}
            style={draft.trim() && !pending ? { background: 'var(--color-amber)' } : undefined}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/ChatView.tsx
git commit -m "feat(ui): add model pill and THINK toggle to ChatView header"
```

---

## Task 6: GraphView — add forceCollide + tune simulation

**Files:**
- Modify: `src/views/GraphView.tsx`

Add `d3ForceCollide`, `d3AlphaDecay`, `d3VelocityDecay` props to `<ForceGraph2D>`. The collision radius matches the node draw radius + padding.

- [ ] **Step 1: Update the `<ForceGraph2D>` props in `src/views/GraphView.tsx`**

Inside the JSX where `<ForceGraph2D` starts (around line 224), add the three new props after `cooldownTicks={120}`:

```tsx
<ForceGraph2D
  ref={fgRef}
  width={dims.width}
  height={dims.height}
  graphData={graphData as unknown as { nodes: NodeObject[]; links: LinkObject[] }}
  backgroundColor={BG}
  nodeCanvasObject={nodeCanvasObject}
  nodeCanvasObjectMode={() => 'replace'}
  nodePointerAreaPaint={nodePointerAreaPaint}
  linkColor={getLinkColor}
  linkWidth={getLinkWidth}
  onNodeClick={handleNodeClick}
  onNodeHover={handleNodeHover}
  onBackgroundClick={handleBackgroundClick}
  cooldownTicks={120}
  d3AlphaDecay={0.03}
  d3VelocityDecay={0.4}
  d3ForceCollide={(node: NodeObject) => Math.sqrt((node as FGNode).val) * 5 + 8}
  onEngineStop={() => fgRef.current?.zoomToFit(400, 60)}
  autoPauseRedraw={false}
  enableNodeDrag={true}
  enableZoomInteraction={true}
  enablePanInteraction={true}
/>
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. (`d3ForceCollide` accepts a number or function returning a number — both are valid per `react-force-graph-2d` types.)

- [ ] **Step 3: Commit**

```bash
git add src/views/GraphView.tsx
git commit -m "fix(graph): add forceCollide and tune alpha/velocity decay to prevent node overlap"
```

---

## Task 7: WikiView — fix wikilink bug + widen text column

**Files:**
- Modify: `src/views/WikiView.tsx`

Two changes in one file:
1. Q4: `max-w-2xl` → `max-w-4xl`
2. Q5: `startsWith('wiki:')` → `includes('wiki:')` + extract target with `split('wiki:')[1]` + add `e.preventDefault()`

Root cause of Q5: browser resolves `wiki:target` as a relative URL to `http://localhost:3100/wiki:target`. By the time the custom `a` component receives `href`, it starts with `http://`, so `startsWith('wiki:')` misses it.

- [ ] **Step 1: Write the wikilink regression test**

In `tests/` there's no WikiView test. Create `tests/views/wikilink.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// Unit test for the logic that detects and extracts wiki: hrefs
function isWikiHref(href: string): boolean {
  return href.includes('wiki:');
}

function extractWikiTarget(href: string): string {
  return decodeURIComponent(href.split('wiki:')[1]);
}

describe('WikiView wikilink href detection', () => {
  it('detects bare wiki: scheme', () => {
    expect(isWikiHref('wiki:attention')).toBe(true);
  });

  it('detects browser-resolved absolute wiki: href', () => {
    expect(isWikiHref('http://localhost:3100/wiki:attention')).toBe(true);
  });

  it('does not match regular https links', () => {
    expect(isWikiHref('https://example.com')).toBe(false);
  });

  it('extracts target from bare wiki: href', () => {
    expect(extractWikiTarget('wiki:attention%20mechanism')).toBe('attention mechanism');
  });

  it('extracts target from browser-resolved href', () => {
    expect(extractWikiTarget('http://localhost:3100/wiki:attention%20mechanism')).toBe('attention mechanism');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx vitest run tests/views/wikilink.test.ts
```

Expected: PASS (these are pure function tests, no component deps).

- [ ] **Step 3: Apply both fixes in `src/views/WikiView.tsx`**

**Fix 1 — wikilink bug (line 302):**
Find:
```tsx
if (href?.startsWith('wiki:')) {
  const target = decodeURIComponent(href.slice(5));
```
Replace with:
```tsx
if (href?.includes('wiki:')) {
  const target = decodeURIComponent(href.split('wiki:')[1]);
```

Also update the button's `onClick` to call `e.preventDefault()` (defensive, prevents any anchor default behavior):
```tsx
<button
  onClick={(e) => { e.preventDefault(); handleWikilink(target); }}
```

**Fix 2 — text width (line 254):**
Find:
```tsx
<div className="max-w-2xl mx-auto px-8 py-8">
```
Replace with:
```tsx
<div className="max-w-4xl mx-auto px-8 py-8">
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/WikiView.tsx tests/views/wikilink.test.ts
git commit -m "fix(wiki): fix wikilink navigation bug and widen content to max-w-4xl"
```

---

## Task 8: Add `parseCostLog()` to `src/lib/cost.ts`

**Files:**
- Modify: `src/lib/cost.ts`
- Test: `tests/lib/cost.test.ts` (extend existing)

The log format (per `src/vault/log.ts`):
```
## [2026-05-18 10:00] ingest | Backpropagation
- source: "raw/sources/backpropagation.md"
- cost_usd: 0.099386

## [2026-05-18 11:00] query | what is backprop
- cost_usd: 0.054
```

- [ ] **Step 1: Extend the test in `tests/lib/cost.test.ts`**

Append to the existing test file:

```ts
import { describe, it, expect } from 'vitest';
import { sumLogCosts, parseCostLog } from '../../src/lib/cost';

// ... existing sumLogCosts tests ...

describe('lib.cost.parseCostLog', () => {
  const LOG = `
## [2026-05-17 10:00] ingest | A
- source: "raw/sources/a.md"
- cost_usd: 0.099

## [2026-05-17 11:00] query | q1
- cost_usd: 0.054

## [2026-05-18 09:00] lint | daily
- cost_usd: 0.027

## [2026-05-18 14:00] ingest | B
- source: "raw/sources/b.md"
- cost_usd: 0.082
`;

  it('sums by type correctly', () => {
    const { byType } = parseCostLog(LOG);
    expect(byType.ingest).toBeCloseTo(0.181, 4);
    expect(byType.chat).toBeCloseTo(0.054, 4);
    expect(byType.lint).toBeCloseTo(0.027, 4);
  });

  it('groups by day correctly', () => {
    const { byDay } = parseCostLog(LOG);
    const may17 = byDay.find(d => d.date === '2026-05-17');
    const may18 = byDay.find(d => d.date === '2026-05-18');
    expect(may17?.ingest).toBeCloseTo(0.099, 4);
    expect(may17?.chat).toBeCloseTo(0.054, 4);
    expect(may18?.lint).toBeCloseTo(0.027, 4);
    expect(may18?.ingest).toBeCloseTo(0.082, 4);
  });

  it('returns total', () => {
    const { total } = parseCostLog(LOG);
    expect(total).toBeCloseTo(0.262, 3);
  });

  it('returns days sorted newest-first', () => {
    const { byDay } = parseCostLog(LOG);
    expect(byDay[0].date > byDay[1].date).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/cost.test.ts
```

Expected: FAIL — `parseCostLog` not exported.

- [ ] **Step 3: Update `src/lib/cost.ts`**

```ts
// Cost utilities for RARE — per-tier USD calculation and log aggregation

export type Tier = 'haiku' | 'sonnet';

// Prices per million tokens (input/output) as of Anthropic pricing
const PRICE_PER_M: Record<Tier, { input: number; output: number }> = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3.0, output: 15.0 },
};

export function computeUsd(
  tier: Tier,
  tokens: { input: number; output: number },
): number {
  const p = PRICE_PER_M[tier];
  const raw = (tokens.input * p.input + tokens.output * p.output) / 1_000_000;
  return Math.round(raw * 1_000_000) / 1_000_000;
}

export function sumLogCosts(logText: string, yearMonth: string): number {
  const entries = logText.split(/\n## \[/).slice(1);
  let total = 0;
  for (const e of entries) {
    if (!e.startsWith(yearMonth)) continue;
    const m = e.match(/cost_usd"?:\s*([0-9.]+)/);
    if (m) total += parseFloat(m[1]);
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}

export interface CostByDay {
  date: string;
  ingest: number;
  chat: number;
  lint: number;
}

export interface CostBreakdown {
  total: number;
  byType: { ingest: number; chat: number; lint: number };
  byDay: CostByDay[];
}

export function parseCostLog(logText: string): CostBreakdown {
  const entries = logText.split(/\n## \[/).slice(1);
  const dayMap = new Map<string, { ingest: number; chat: number; lint: number }>();

  for (const e of entries) {
    const dateMatch = e.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const date = dateMatch[1];

    // event type is after the date+time, before " | "
    const typeMatch = e.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] (\w+) \|/);
    if (!typeMatch) continue;
    const rawType = typeMatch[1];
    // log event "query" is exposed as "chat"
    const type: 'ingest' | 'chat' | 'lint' =
      rawType === 'ingest' ? 'ingest' :
      rawType === 'query'  ? 'chat'   :
      rawType === 'lint'   ? 'lint'   : 'chat';

    const costMatch = e.match(/cost_usd"?:\s*([0-9.]+)/);
    if (!costMatch) continue;
    const cost = parseFloat(costMatch[1]);

    const day = dayMap.get(date) ?? { ingest: 0, chat: 0, lint: 0 };
    day[type] = Math.round((day[type] + cost) * 1_000_000) / 1_000_000;
    dayMap.set(date, day);
  }

  const byDay: CostByDay[] = Array.from(dayMap.entries())
    .map(([date, costs]) => ({ date, ...costs }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const byType = { ingest: 0, chat: 0, lint: 0 };
  for (const day of byDay) {
    byType.ingest = Math.round((byType.ingest + day.ingest) * 1_000_000) / 1_000_000;
    byType.chat   = Math.round((byType.chat   + day.chat)   * 1_000_000) / 1_000_000;
    byType.lint   = Math.round((byType.lint   + day.lint)   * 1_000_000) / 1_000_000;
  }

  const total = Math.round((byType.ingest + byType.chat + byType.lint) * 1_000_000) / 1_000_000;
  return { total, byType, byDay };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/lib/cost.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cost.ts tests/lib/cost.test.ts
git commit -m "feat(lib): add parseCostLog for structured cost breakdown by type and day"
```

---

## Task 9: Add API endpoints — /api/costs and /api/costs/sources

**Files:**
- Modify: `server.ts`

Add two new GET endpoints before the SPA fallback. Import `parseCostLog` at the top.

- [ ] **Step 1: Add imports to `server.ts`**

Find:
```ts
import { sumLogCosts } from './src/lib/cost.js';
```
Replace with:
```ts
import { sumLogCosts, parseCostLog } from './src/lib/cost.js';
```

- [ ] **Step 2: Add `GET /api/costs/sources` before the SPA fallback**

After the `app.get('/api/page', ...)` handler and before the SPA fallback comment:

```ts
// ── Cost endpoints ───────────────────────────────────────────────────────────

app.get('/api/costs/sources', async (_req: Request, res: Response) => {
  try {
    let logText = '';
    try { logText = await readFileText(join(VAULT_PATH, 'wiki', 'log.md')); } catch { /* no log */ }
    const entries = logText.split(/\n## \[/).slice(1);
    const sourceCosts: Record<string, number> = {};
    for (const e of entries) {
      if (!e.includes('] ingest |')) continue;
      const srcMatch = e.match(/source"?:\s*"([^"]+)"/);
      const costMatch = e.match(/cost_usd"?:\s*([0-9.]+)/);
      if (srcMatch && costMatch) {
        const src = srcMatch[1];
        const cost = parseFloat(costMatch[1]);
        sourceCosts[src] = Math.round(((sourceCosts[src] ?? 0) + cost) * 1_000_000) / 1_000_000;
      }
    }
    res.json(sourceCosts);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/costs', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string | undefined) ?? 'month';
    let logText = '';
    try { logText = await readFileText(join(VAULT_PATH, 'wiki', 'log.md')); } catch { /* no log */ }

    const breakdown = parseCostLog(logText);
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);

    if (period === 'today') {
      const todayDays = breakdown.byDay.filter(d => d.date === today);
      const byType = { ingest: 0, chat: 0, lint: 0 };
      for (const d of todayDays) {
        byType.ingest += d.ingest;
        byType.chat   += d.chat;
        byType.lint   += d.lint;
      }
      const total = byType.ingest + byType.chat + byType.lint;
      return res.json({ total, byType, byDay: todayDays });
    }

    if (period === 'month') {
      const monthDays = breakdown.byDay.filter(d => d.date.startsWith(thisMonth));
      const byType = { ingest: 0, chat: 0, lint: 0 };
      for (const d of monthDays) {
        byType.ingest += d.ingest;
        byType.chat   += d.chat;
        byType.lint   += d.lint;
      }
      const total = byType.ingest + byType.chat + byType.lint;
      return res.json({ total, byType, byDay: monthDays });
    }

    // 'all'
    return res.json(breakdown);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat(server): add GET /api/costs and GET /api/costs/sources endpoints"
```

---

## Task 10: SourcesView — cost per source card

**Files:**
- Modify: `src/views/SourcesView.tsx`

Fetch `/api/costs/sources` on mount alongside `/api/sources`. Show a cost badge on the right of each card row.

- [ ] **Step 1: Update `src/views/SourcesView.tsx`**

**Add `costsMap` state** at the top of `SourcesView`:
```tsx
const [costsMap, setCostsMap] = useState<Record<string, number>>({});
```

**Update the `load` function** to also fetch costs:
```tsx
async function load() {
  try {
    const [sourcesRes, costsRes] = await Promise.all([
      fetch('/api/sources'),
      fetch('/api/costs/sources'),
    ]);
    const data = await sourcesRes.json() as SourceMeta[];
    const costs = await costsRes.json() as Record<string, number>;
    setSources(data.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)));
    setCostsMap(costs);
  } catch {
    setError('Failed to load sources');
  } finally {
    setLoading(false);
  }
}
```

**Add cost badge to the card row** (inside the row `div` after the date span and before the delete button):
```tsx
{/* Cost badge */}
<span className="text-[12px] font-mono shrink-0 text-right" style={{ minWidth: '52px' }}>
  {costsMap[src.path] !== undefined
    ? <span style={{ color: '#34d399' }}>${costsMap[src.path].toFixed(3)}</span>
    : <span className="text-ink-dim">—</span>
  }
</span>
```

The full updated row (replacing the existing `<div className="flex items-center gap-3 shrink-0">` block):
```tsx
<div className="flex items-center gap-3 shrink-0">
  <span className="text-[11px] font-mono text-ink-dim hidden sm:block">
    {formatBytes(src.sizeBytes)}
  </span>
  <span className="text-[11px] font-mono text-ink-dim hidden sm:block">
    {formatDate(src.modifiedAt)}
  </span>
  {/* Ingest cost */}
  <div className="text-right hidden sm:block" style={{ minWidth: '52px' }}>
    {costsMap[src.path] !== undefined
      ? <span className="text-[12px] font-mono" style={{ color: '#34d399' }}>
          ${costsMap[src.path].toFixed(3)}
        </span>
      : <span className="text-[12px] font-mono text-ink-dim">—</span>
    }
    <p className="text-[9px] text-ink-dim/50 font-mono">ingest</p>
  </div>
  <button
    onClick={() => setConfirmPath(src.path)}
    disabled={isDeleting}
    className="w-7 h-7 flex items-center justify-center rounded text-ink-dim hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
    title="Delete source and cascade wiki pages"
  >
    <Trash2 size={13} />
  </button>
</div>
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/SourcesView.tsx
git commit -m "feat(ui): show ingest cost per source card in SourcesView"
```

---

## Task 11: SettingsView — cost breakdown dashboard

**Files:**
- Modify: `src/views/SettingsView.tsx`

Replace the single `monthly_cost_usd` bar with: period toggle (Today/Month/All), total + stacked bar, daily table. Pure CSS/flexbox — no chart library.

- [ ] **Step 1: Update `src/views/SettingsView.tsx`**

Replace the entire file:

```tsx
import { useEffect, useState } from 'react';
import { FolderOpen, DollarSign, Clock, Play, Save } from 'lucide-react';

interface SettingsData {
  vault_path: string;
  cost_ceiling_usd: number;
  lint_interval_hours: number;
  monthly_cost_usd: number;
}

interface CostBreakdown {
  total: number;
  byType: { ingest: number; chat: number; lint: number };
  byDay: Array<{ date: string; ingest: number; chat: number; lint: number }>;
}

type Period = 'today' | 'month' | 'all';

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-rim rounded-lg overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-rim">
        <Icon size={14} className="text-ink-dim" />
        <span className="text-xs font-mono text-ink-dim uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function fmt(n: number): string {
  return n > 0 ? `$${n.toFixed(3)}` : '—';
}

export function SettingsView() {
  const [settings, setSettings]       = useState<SettingsData | null>(null);
  const [costCeiling, setCostCeiling] = useState('');
  const [lintHours, setLintHours]     = useState('');
  const [status, setStatus]           = useState('');
  const [linting, setLinting]         = useState(false);
  const [period, setPeriod]           = useState<Period>('month');
  const [costs, setCosts]             = useState<CostBreakdown | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((s: SettingsData) => {
        setSettings(s);
        setCostCeiling(String(s.cost_ceiling_usd));
        setLintHours(String(s.lint_interval_hours));
      })
      .catch(() => setStatus('Failed to load settings'));
  }, []);

  useEffect(() => {
    fetch(`/api/costs?period=${period}`)
      .then(r => r.json())
      .then((c: CostBreakdown) => setCosts(c))
      .catch(() => { /* ignore */ });
  }, [period]);

  async function save() {
    setStatus('');
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost_ceiling_usd:    Number(costCeiling),
          lint_interval_hours: Number(lintHours),
        }),
      });
      if (!r.ok) throw new Error('Save failed');
      const updated = await r.json() as SettingsData;
      setSettings(updated);
      setStatus('Saved');
      setTimeout(() => setStatus(''), 2000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function runLint() {
    setLinting(true);
    setStatus('');
    try {
      const r = await fetch('/api/lint', { method: 'POST' });
      if (!r.ok) throw new Error('Lint failed');
      setStatus('Lint complete');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Lint failed');
    } finally {
      setLinting(false);
    }
  }

  if (!settings) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-ink-dim">{status || 'Loading…'}</p>
      </div>
    );
  }

  const total = costs?.total ?? 0;
  const byType = costs?.byType ?? { ingest: 0, chat: 0, lint: 0 };
  const byDay  = costs?.byDay  ?? [];
  const barTotal = byType.ingest + byType.chat + byType.lint;

  const PERIOD_LABELS: Record<Period, string> = { today: 'Today', month: 'This month', all: 'All time' };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-xl space-y-4">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-ink mb-1">Settings</h1>
          <p className="text-sm text-ink-dim">Configure vault, cost limits, and lint schedule.</p>
        </div>

        <Section icon={FolderOpen} title="Vault">
          <p className="text-sm text-ink-dim mb-1">Path</p>
          <p className="text-sm font-mono text-ink bg-base px-3 py-2 rounded border border-rim break-all">
            {settings.vault_path}
          </p>
        </Section>

        {/* ── Cost breakdown section ─────────────────────────── */}
        <Section icon={DollarSign} title="Cost">

          {/* Period toggle */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-ink-dim">Period:</span>
            <div className="flex bg-base border border-rim rounded overflow-hidden">
              {(['today', 'month', 'all'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={[
                    'px-3 py-1 text-[11px] font-mono transition-colors',
                    period === p
                      ? 'bg-amber text-black font-bold'
                      : 'text-ink-dim hover:text-ink',
                  ].join(' ')}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Total + stacked bar */}
          <div className="bg-base border border-rim rounded-lg p-3 mb-3">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-xs text-ink-dim">{PERIOD_LABELS[period]}</span>
              <span className="text-[15px] font-mono font-bold text-ink">${total.toFixed(3)}</span>
            </div>

            {barTotal > 0 ? (
              <>
                {/* Stacked proportional bar */}
                <div className="h-2 rounded-full overflow-hidden flex gap-px mb-2">
                  {byType.ingest > 0 && (
                    <div
                      className="h-full rounded-l-full"
                      style={{ width: `${(byType.ingest / barTotal) * 100}%`, background: '#34d399' }}
                    />
                  )}
                  {byType.chat > 0 && (
                    <div
                      className="h-full"
                      style={{ width: `${(byType.chat / barTotal) * 100}%`, background: '#38bdf8' }}
                    />
                  )}
                  {byType.lint > 0 && (
                    <div
                      className="h-full rounded-r-full"
                      style={{ width: `${(byType.lint / barTotal) * 100}%`, background: '#f0a030' }}
                    />
                  )}
                </div>
                {/* Legend */}
                <div className="flex gap-4 flex-wrap">
                  {[
                    { label: 'Ingest', color: '#34d399', val: byType.ingest },
                    { label: 'Chat',   color: '#38bdf8', val: byType.chat   },
                    { label: 'Lint',   color: '#f0a030', val: byType.lint   },
                  ].map(({ label, color, val }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
                      <span className="text-[10px] font-mono text-ink-dim">
                        {label} {fmt(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-dim">No costs recorded for this period.</p>
            )}
          </div>

          {/* Daily table */}
          {byDay.length > 0 && (
            <div className="bg-base border border-rim rounded-lg overflow-hidden">
              {/* Header */}
              <div className="flex justify-between px-3 py-1.5 border-b border-rim">
                <span className="text-[10px] font-mono text-ink-dim/60 uppercase tracking-widest">Date</span>
                <div className="flex gap-4">
                  <span className="text-[10px] font-mono uppercase tracking-widest w-14 text-right" style={{ color: '#34d39970' }}>Ingest</span>
                  <span className="text-[10px] font-mono uppercase tracking-widest w-12 text-right" style={{ color: '#38bdf870' }}>Chat</span>
                  <span className="text-[10px] font-mono uppercase tracking-widest w-10 text-right" style={{ color: '#f0a03070' }}>Lint</span>
                </div>
              </div>
              {byDay.map(day => (
                <div key={day.date} className="flex justify-between px-3 py-2 border-b border-rim/40 last:border-0">
                  <span className="text-[11px] font-mono text-ink-dim">{day.date}</span>
                  <div className="flex gap-4">
                    <span className="text-[11px] font-mono w-14 text-right" style={{ color: day.ingest > 0 ? '#34d399' : undefined }}>
                      {day.ingest > 0 ? fmt(day.ingest) : <span className="text-ink-dim/40">—</span>}
                    </span>
                    <span className="text-[11px] font-mono w-12 text-right" style={{ color: day.chat > 0 ? '#38bdf8' : undefined }}>
                      {day.chat > 0 ? fmt(day.chat) : <span className="text-ink-dim/40">—</span>}
                    </span>
                    <span className="text-[11px] font-mono w-10 text-right" style={{ color: day.lint > 0 ? '#f0a030' : undefined }}>
                      {day.lint > 0 ? fmt(day.lint) : <span className="text-ink-dim/40">—</span>}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ceiling config */}
          <div className="mt-4">
            <label className="block">
              <p className="text-xs text-ink-dim mb-1.5">Monthly ceiling (USD)</p>
              <input
                type="number"
                value={costCeiling}
                onChange={e => setCostCeiling(e.target.value)}
                className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink font-mono input-amber-focus"
              />
            </label>
          </div>
        </Section>

        <Section icon={Clock} title="Lint">
          <label className="block mb-4">
            <p className="text-xs text-ink-dim mb-1.5">Run interval (hours)</p>
            <input
              type="number"
              value={lintHours}
              onChange={e => setLintHours(e.target.value)}
              className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink font-mono input-amber-focus"
            />
          </label>
          <button
            onClick={runLint}
            disabled={linting}
            className="flex items-center gap-2 px-3 py-2 rounded border border-rim text-sm text-ink-dim hover:text-ink hover:border-ink-dim transition-colors disabled:opacity-50"
          >
            <Play size={13} />
            {linting ? 'Running…' : 'Run lint now'}
          </button>
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium text-black transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'var(--color-amber)' }}
          >
            <Save size={13} />
            Save
          </button>
          {status && (
            <span className={`text-xs ${status === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/SettingsView.tsx
git commit -m "feat(ui): replace monthly cost with full cost breakdown dashboard in SettingsView"
```

---

## Task 12: Add `pdfToDocumentBlock()` to `src/sources/pdf.ts`

**Files:**
- Modify: `src/sources/pdf.ts`
- Test: `tests/sources/pdf.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Open `tests/sources/pdf.test.ts` and add:

```ts
it('pdfToDocumentBlock returns a base64 document block', async () => {
  const { pdfToDocumentBlock } = await import('../../src/sources/pdf');
  const { writeFile, unlink } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');

  // minimal 1-byte "pdf" stub for testing
  const tmpPath = join(tmpdir(), 'test-stub.pdf');
  await writeFile(tmpPath, Buffer.from('stub'));
  try {
    const block = await pdfToDocumentBlock(tmpPath);
    expect(block.type).toBe('document');
    expect(block.source.type).toBe('base64');
    expect(block.source.media_type).toBe('application/pdf');
    expect(typeof block.source.data).toBe('string');
    expect(block.source.data.length).toBeGreaterThan(0);
  } finally {
    await unlink(tmpPath);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/sources/pdf.test.ts
```

Expected: FAIL — `pdfToDocumentBlock` not exported.

- [ ] **Step 3: Update `src/sources/pdf.ts`**

```ts
export async function pdfToMarkdown(absPath: string): Promise<string> {
  if (!absPath || !absPath.endsWith('.pdf')) {
    throw new Error(`pdfToMarkdown: expected an absolute .pdf path, got: ${absPath}`);
  }
  if (typeof window === 'undefined') {
    // Node.js server path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = ((await import('pdf-parse')) as any).default;
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(absPath);
    const data = await pdfParse(buffer);
    return data.text as string;
  }
  // Tauri path
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('extract_pdf_text', { path: absPath });
  } catch (err: unknown) {
    throw new Error(err instanceof Error ? err.message : 'PDF extraction failed');
  }
}

export interface PdfDocumentBlock {
  type: 'document';
  source: {
    type: 'base64';
    media_type: 'application/pdf';
    data: string;
  };
}

export async function pdfToDocumentBlock(absPath: string): Promise<PdfDocumentBlock> {
  if (!absPath || !absPath.endsWith('.pdf')) {
    throw new Error(`pdfToDocumentBlock: expected an absolute .pdf path, got: ${absPath}`);
  }
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(absPath);
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: buffer.toString('base64'),
    },
  };
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/sources/pdf.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sources/pdf.ts tests/sources/pdf.test.ts
git commit -m "feat(sources): add pdfToDocumentBlock for vision mode PDF ingestion"
```

---

## Task 13: Update `analyze.ts` to accept string | document block

**Files:**
- Modify: `src/ingest/analyze.ts`
- Test: `tests/ingest/analyze.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Open `tests/ingest/analyze.test.ts` and add a test for the document-block path:

```ts
it('builds multimodal messages when sourceContent is a document block', async () => {
  const { analyze } = await import('../../src/ingest/analyze');
  const { chat } = await import('../../src/llm/anthropic');
  const chatMock = vi.mocked(chat);
  chatMock.mockResolvedValueOnce({
    text: '',
    toolUse: {
      name: 'record_analysis',
      input: {
        source_title: 'Test',
        source_summary: 'summary',
        entities: [],
        concepts: [],
        connections: [],
        contradictions: [],
        recommended_pages: [],
      },
    },
    inputTokens: 100,
    outputTokens: 50,
    usd: 0.001,
  });

  const block = {
    type: 'document' as const,
    source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: 'abc=' },
  };

  await analyze({ sourceContent: block, purpose: '', schema: '', index: '' });

  const callArgs = chatMock.mock.calls[chatMock.mock.calls.length - 1][0];
  // messages content should be an array (multimodal) not a plain string
  expect(Array.isArray(callArgs.messages[0].content)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/ingest/analyze.test.ts
```

Expected: FAIL — `sourceContent` field not accepted.

- [ ] **Step 3: Update `src/ingest/analyze.ts`**

```ts
import analyzeTemplate from '../../prompts/analyze.md?raw';
import { chat } from '../llm/anthropic';
import type { PdfDocumentBlock } from '../sources/pdf';

export interface AnalyzeInput {
  sourceContent: string | PdfDocumentBlock;
  purpose: string;
  schema: string;
  index: string;
}

export interface AnalyzeResult {
  source_title: string;
  source_summary: string;
  entities: Array<{ name: string; type: string; description: string; is_new: boolean }>;
  concepts: Array<{ name: string; description: string; is_new: boolean }>;
  connections: Array<{ target_page: string; relation: string }>;
  contradictions: Array<{ existing_page: string; conflict: string }>;
  recommended_pages: Array<{ action: 'create' | 'update'; path: string; rationale: string }>;
}

const ANALYZE_TOOL = {
  name: 'record_analysis',
  description: 'Record a structured analysis of the source.',
  input_schema: {
    type: 'object',
    properties: {
      source_title: { type: 'string' },
      source_summary: { type: 'string' },
      entities: { type: 'array', items: { type: 'object' } },
      concepts: { type: 'array', items: { type: 'object' } },
      connections: { type: 'array', items: { type: 'object' } },
      contradictions: { type: 'array', items: { type: 'object' } },
      recommended_pages: { type: 'array', items: { type: 'object' } },
    },
    required: [
      'source_title', 'source_summary', 'entities', 'concepts',
      'connections', 'contradictions', 'recommended_pages',
    ],
  },
} as const;

export async function analyze(input: AnalyzeInput): Promise<{ result: AnalyzeResult; usd: number }> {
  const basePrompt = analyzeTemplate
    .replace('{{purpose}}', input.purpose)
    .replace('{{schema}}',  input.schema)
    .replace('{{index}}',   input.index);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: any[];

  if (typeof input.sourceContent === 'string') {
    const prompt = basePrompt.replace('{{source}}', input.sourceContent);
    messages = [{ role: 'user', content: prompt }];
  } else {
    // Vision PDF — replace {{source}} placeholder with a note; attach document block
    const textPart = basePrompt.replace('{{source}}', '[See attached PDF document]');
    messages = [{
      role: 'user',
      content: [
        { type: 'text', text: textPart },
        input.sourceContent,
      ],
    }];
  }

  const resp = await chat({
    model: 'haiku',
    system: 'You analyze sources for a personal knowledge wiki.',
    messages,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [ANALYZE_TOOL as any],
    maxTokens: 4096,
  });

  if (!resp.toolUse || resp.toolUse.name !== 'record_analysis') {
    throw new Error('Expected tool_use(record_analysis); got none');
  }
  return { result: resp.toolUse.input as AnalyzeResult, usd: resp.usd };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/ingest/analyze.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update `orchestrate.ts` to use `sourceContent` field**

In `src/ingest/orchestrate.ts`, the call to `analyze()` currently passes `sourceText`. Update:

Find:
```ts
  const { result: analysis, usd: analyzeUsd } = await analyze({
    sourceText,
    purpose,
    schema,
    index: indexBody,
  });
```
Replace with:
```ts
  const { result: analysis, usd: analyzeUsd } = await analyze({
    sourceContent: sourceText,
    purpose,
    schema,
    index: indexBody,
  });
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/ingest/analyze.ts src/ingest/orchestrate.ts tests/ingest/analyze.test.ts
git commit -m "feat(ingest): analyze.ts accepts string | PdfDocumentBlock as sourceContent"
```

---

## Task 14: Vision PDF — orchestrate + server + PasteView

**Files:**
- Modify: `src/ingest/orchestrate.ts`
- Modify: `server.ts`
- Modify: `src/views/PasteView.tsx`

**Vision PDF storage strategy:**
- Text-mode PDF upload: `pdfParse(buffer)` → text → store in `raw/sources/slug.md` → SHA of text
- Vision-mode PDF upload: store raw bytes in `raw/sources/slug.pdf` → SHA of bytes → different SHA

This means the same PDF uploaded in both modes creates two separate queue entries with different SHAs, so the user can re-ingest without deleting first.

- [ ] **Step 1: Update `src/ingest/orchestrate.ts` to handle `.pdf` rawPath**

At the start of `ingestSource`, replace:
```ts
const sourceText = await readFileText(pathJoin(vault.root, rawPath));
```
with:
```ts
import { pdfToDocumentBlock } from '../sources/pdf.js';

// ...

const isVisionPdf = rawPath.endsWith('.pdf');
let sourceContent: string | import('../sources/pdf.js').PdfDocumentBlock;
let sourceText: string;

if (isVisionPdf) {
  sourceContent = await pdfToDocumentBlock(pathJoin(vault.root, rawPath));
  sourceText = ''; // not used; generate step will use analysis.source_summary
} else {
  sourceText = await readFileText(pathJoin(vault.root, rawPath));
  sourceContent = sourceText;
}
```

Update the `analyze` call:
```ts
const { result: analysis, usd: analyzeUsd } = await analyze({
  sourceContent,
  purpose,
  schema,
  index: indexBody,
});
```

Update the `generate` call to use summary as excerpt for vision PDFs:
```ts
const { pages, usd: generateUsd } = await generate({
  analysis,
  purpose,
  schema,
  sourceExcerpt: isVisionPdf ? analysis.source_summary : sourceText,
});
```

Full updated `ingestSource` function:

```ts
export async function ingestSource(vault: VaultRoot, rawPath: string): Promise<void> {
  const absPath = pathJoin(vault.root, rawPath);
  const isVisionPdf = rawPath.endsWith('.pdf');

  let sourceContent: string | PdfDocumentBlock;
  let sourceExcerpt: string;

  if (isVisionPdf) {
    sourceContent = await pdfToDocumentBlock(absPath);
    sourceExcerpt = ''; // filled from analysis.source_summary below
  } else {
    const text = await readFileText(absPath);
    sourceContent = text;
    sourceExcerpt = text;
  }

  const purpose = await safeRead(pathJoin(vault.root, 'purpose.md'));
  const schema = await safeRead(pathJoin(vault.root, 'schema.md'));
  const indexBody = await readIndex(vault);

  const { result: analysis, usd: analyzeUsd } = await analyze({
    sourceContent,
    purpose,
    schema,
    index: indexBody,
  });

  if (isVisionPdf) sourceExcerpt = analysis.source_summary;

  const { pages, usd: generateUsd } = await generate({
    analysis,
    purpose,
    schema,
    sourceExcerpt,
  });

  const costUsd = Math.round((analyzeUsd + generateUsd) * 1_000_000) / 1_000_000;
  const now = new Date().toISOString();

  for (const raw of pages) {
    const p = { ...raw, path: normalizePath(raw.path) };
    const type = typeFromPath(p.path);
    const slug = p.path.split('/')[1] ?? p.path;
    const title = slug.replace(/-/g, ' ');
    await writePage(vault, {
      path: p.path,
      frontmatter: { type, title, sources: [rawPath], created: now, updated: now },
      body: p.body,
    });
    const summary = summaryForPage(p.path, analysis, rawPath);
    await updateIndex(vault, { path: p.path, title, type, summary });
  }

  await appendLog(vault, {
    event: 'ingest',
    title: analysis.source_title,
    detail: { pages_written: pages.length, source: rawPath, cost_usd: costUsd },
  });

  const indexAfter = await readIndex(vault);
  await regenerateOverview(vault, purpose, indexAfter);
}
```

Add the import at the top of `orchestrate.ts`:
```ts
import { pdfToDocumentBlock, type PdfDocumentBlock } from '../sources/pdf';
```

- [ ] **Step 2: Update `server.ts` — POST /api/ingest/upload handles visionPdf query param**

The upload endpoint uses `express.raw()` which receives binary body, so `visionPdf` is passed as a query parameter.

Find and replace the `app.post('/api/ingest/upload', ...)` handler:

```ts
app.post('/api/ingest/upload', express.raw({ type: 'application/pdf', limit: '50mb' }), async (req: Request, res: Response) => {
  try {
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: 'PDF body required (Content-Type: application/pdf)' });
    }
    const visionPdf = req.query.visionPdf === 'true';
    const filename = ((req.headers['x-filename'] as string) ?? 'upload.pdf')
      .replace(/[/\\]/g, '');
    const slug = filename.replace(/\.pdf$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';

    if (visionPdf) {
      // Vision mode: store raw PDF bytes, SHA of bytes
      const rawPath = `raw/sources/${slug}.pdf`;
      const destPath = join(VAULT_PATH, rawPath);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(destPath, buffer);
      const hash = sha256(buffer.toString('base64'));
      try {
        const task = await queue.enqueue(rawPath, hash);
        triggerWorker();
        res.json({ jobId: task.id });
      } catch {
        const existing = queueBackend.select<{ id: number; status: string }[]>(
          'SELECT id, status FROM ingest_queue WHERE sha256 = ?', [hash],
        );
        res.json({ jobId: existing[0]?.id ?? 0, cached: true });
      }
    } else {
      // Text mode: extract text, store as .md, SHA of text
      const pdfParse = ((await import('pdf-parse')) as { default: (buf: Buffer) => Promise<{ text: string }> }).default;
      const { text } = await pdfParse(buffer);
      if (!text.trim()) return res.status(422).json({ error: 'No text extracted from PDF' });
      const rawPath = `raw/sources/${slug}.md`;
      await writeFileText(join(VAULT_PATH, rawPath), text);
      const hash = sha256(text);
      try {
        const task = await queue.enqueue(rawPath, hash);
        triggerWorker();
        res.json({ jobId: task.id });
      } catch {
        const existing = queueBackend.select<{ id: number; status: string }[]>(
          'SELECT id, status FROM ingest_queue WHERE sha256 = ?', [hash],
        );
        res.json({ jobId: existing[0]?.id ?? 0, cached: true });
      }
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

Also update `GET /api/sources` to list `.pdf` files alongside `.md` files:

Find:
```ts
files.filter(f => f.endsWith('.md')).map(async f => {
```
Replace with:
```ts
files.filter(f => f.endsWith('.md') || f.endsWith('.pdf')).map(async f => {
```

- [ ] **Step 3: Update `src/views/PasteView.tsx` — add vision toggle below PDF drop zone**

Add state for the toggle:
```tsx
const [visionPdf, setVisionPdf] = useState(false);
```

Update `uploadPdf` to pass `?visionPdf=true` when enabled:
```tsx
async function uploadPdf(file: File) {
  setBusy(true);
  setNotice('');
  try {
    const url = visionPdf ? '/api/ingest/upload?visionPdf=true' : '/api/ingest/upload';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', 'X-Filename': file.name },
      body: file,
    });
    await enqueueResult(r);
    setPdfFile(null);
    if (fileRef.current) fileRef.current.value = '';
  } catch (err) {
    setNotice(err instanceof Error ? err.message : 'Upload failed');
  } finally {
    setBusy(false);
  }
}
```

Add the vision toggle **below** the PDF drop zone div, before the closing tag of the PDF section:
```tsx
{/* Vision mode toggle */}
<div className="mt-3 flex items-start gap-3 px-1">
  <button
    onClick={() => setVisionPdf(v => !v)}
    className={[
      'w-8 h-4 rounded-full relative shrink-0 mt-0.5 transition-colors',
      visionPdf ? 'bg-amber' : 'bg-card border border-rim',
    ].join(' ')}
    style={{ height: '18px', width: '32px' }}
    title="Toggle vision mode"
  >
    <span
      className="absolute top-0.5 rounded-full transition-transform"
      style={{
        width: '12px',
        height: '12px',
        top: '2px',
        transform: visionPdf ? 'translateX(16px)' : 'translateX(2px)',
        background: visionPdf ? '#000' : '#fff',
      }}
    />
  </button>
  <div>
    <p className="text-[12px] text-ink-dim">
      Vision mode — Claude reads images and charts in PDFs
    </p>
    <p className="text-[11px] text-amber/70 mt-0.5">
      ⚠ Uses significantly more tokens than text-only (~3–10× cost per page)
    </p>
  </div>
</div>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ingest/orchestrate.ts server.ts src/views/PasteView.tsx
git commit -m "feat(ingest): add vision PDF mode — store raw bytes, send document block to Claude"
```

---

## Task 15: Full test suite + docker smoke

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 2: Build docker image and smoke test**

```bash
docker compose down && docker compose up --build -d
```

Wait ~10 seconds, then:
```bash
docker compose logs rare | tail -20
```

Expected: `RARE server on http://localhost:3100` with no startup errors.

- [ ] **Step 3: Manual smoke tests**

Open `http://localhost:3100`:

1. **Graph tab** — ingest a source if needed. Verify nodes don't overlap. Graph should settle cleanly.
2. **Chat tab** — verify Haiku/Sonnet/Opus pill renders. Switch to Haiku — THINK toggle should grey out. Switch to Sonnet — THINK toggle should be active.
3. **Wiki tab** — open a page with `[[wikilinks]]`. Click one — should navigate to the target page, not home. Content should fill the wider column.
4. **Sources tab** — verify ingest cost badge appears (green `$0.xxx` on right of each card).
5. **Settings tab** — verify cost breakdown shows Today/Month/All toggle, stacked bar, and daily table.
6. **Ingest tab** — verify vision mode toggle appears below the PDF drop zone with cost warning.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: UX improvements Q2–Q8 complete"
```

---

## Spec Coverage Self-Review

| Spec item | Task(s) covering it |
|-----------|---------------------|
| Q2 — Graph forceCollide | Task 6 |
| Q3 — Chat model pill + THINK toggle | Tasks 1–5 |
| Q3 — Haiku disables THINK | Task 5 (ChatView) |
| Q3 — Server validates model | Task 4 |
| Q4 — Wiki max-w-4xl | Task 7 |
| Q5 — Wikilink href bug | Task 7 |
| Q6 — Cost per source card | Tasks 8, 9, 10 |
| Q7 — Cost breakdown dashboard | Tasks 8, 9, 11 |
| Q7 — period=today\|month\|all | Task 9 |
| Q7 — log event `query` → `chat` | Task 8 |
| Q8 — pdfToDocumentBlock | Task 12 |
| Q8 — analyze accepts document block | Task 13 |
| Q8 — orchestrate vision path | Task 14 |
| Q8 — PasteView vision toggle + warning | Task 14 |
| Q8 — default vision = off | Task 14 (useState default) |
| Q8 — vision uses sha(bytes) ≠ sha(text) | Task 14 (server.ts) |
