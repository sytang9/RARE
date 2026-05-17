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
      {/* Header with model controls */}
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
              className="rounded-full relative transition-colors disabled:cursor-not-allowed"
              style={{
                background: thinking && !thinkingDisabled
                  ? 'var(--color-amber)'
                  : 'var(--color-card)',
                border: '1px solid var(--color-rim)',
                height: '18px',
                width: '32px',
                padding: 0,
              }}
              title={thinkingDisabled ? 'Extended thinking not available for Haiku' : 'Toggle extended thinking'}
            >
              <span
                className="absolute rounded-full transition-transform"
                style={{
                  width: '12px',
                  height: '12px',
                  top: '3px',
                  left: '2px',
                  transform: thinking && !thinkingDisabled ? 'translateX(16px)' : 'translateX(0)',
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
