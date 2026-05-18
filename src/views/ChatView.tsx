import { useEffect, useRef, useState } from 'react';
import { Send, BookOpen, Plus, Trash2, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '../state/chatStore';
import type { ChatSummary } from '../state/chatStore';
import { ConfirmDialog } from './ConfirmDialog';

// Strip [[wikilinks]] brackets, bold the text inside
function processAssistant(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, '**$1**');
}

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso + 'Z').getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function HistoryItem({
  chat,
  active,
  onSelect,
  onDelete,
}: {
  chat: ChatSummary;
  active: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={[
        'group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-l-2 transition-colors',
        active
          ? 'bg-[rgba(240,160,48,0.08)] border-amber'
          : 'hover:bg-card border-transparent',
      ].join(' ')}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <MessageSquare size={11} className={active ? 'text-amber shrink-0' : 'text-ink-dim shrink-0'} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ink truncate leading-tight">{chat.title}</p>
        <p className="text-[10px] text-ink-dim mt-0.5">{relativeTime(chat.updated_at)}</p>
      </div>
      {(hovered || active) && (
        <button
          onClick={onDelete}
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-ink-dim hover:text-red-400 transition-colors"
          title="Delete chat"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

export function ChatView() {
  const { chatId, messages, pending, chatList, send, loadChat, newChat, deleteChat, loadHistory } = useChatStore();
  const [draft, setDraft]           = useState('');
  const [error, setError]           = useState('');
  const [model, setModel]           = useState<ModelChoice>('sonnet');
  const [thinking, setThinking]     = useState(false);
  const [confirmChatId, setConfirmChatId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

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

  function handleNewChat() {
    newChat();
    inputRef.current?.focus();
  }

  function handleDeleteChat(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmChatId(id);
  }

  async function doDeleteChat(id: number) {
    setConfirmChatId(null);
    await deleteChat(id);
  }

  const empty = messages.length === 0 && !pending;

  return (
    <div className="h-full flex overflow-hidden">
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

      {/* ── Right panel: conversation ─────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header with model controls */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-rim bg-panel shrink-0">
          <span className="text-[13px] font-semibold text-ink truncate pr-4">
            {chatId ? (chatList.find(c => c.id === chatId)?.title ?? 'Chat') : 'Chat'}
          </span>
          <div className="flex items-center gap-3 shrink-0">
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

        {/* Messages */}
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
                      {isUser ? m.content : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p className="mb-3 last:mb-0 leading-7">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc list-outside pl-4 mb-3 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-outside pl-4 mb-3 space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="leading-6">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
                            em: ({ children }) => <em className="text-ink-dim">{children}</em>,
                            h3: ({ children }) => <h3 className="font-semibold text-ink mt-4 mb-1.5 first:mt-0">{children}</h3>,
                            hr: () => <hr className="border-rim my-3" />,
                            code: ({ children }) => <code className="bg-black/20 rounded px-1 py-0.5 text-xs font-mono text-amber/80">{children}</code>,
                          }}
                        >
                          {processAssistant(m.content)}
                        </ReactMarkdown>
                      )}
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

      {confirmChatId !== null && (() => {
        const chat = chatList.find(c => c.id === confirmChatId);
        return (
          <ConfirmDialog
            title="Delete conversation?"
            body={`"${chat?.title ?? 'This conversation'}" will be permanently deleted.`}
            onConfirm={() => doDeleteChat(confirmChatId)}
            onCancel={() => setConfirmChatId(null)}
          />
        );
      })()}
    </div>
  );
}
