import { useState } from 'react';
import { useChatStore } from '../state/chatStore';

export function ChatView() {
  const { messages, pending, send } = useChatStore();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <span className="inline-block px-3 py-2 rounded bg-zinc-800 text-zinc-100">{m.content}</span>
          </div>
        ))}
        {pending && <div className="text-zinc-500">thinking...</div>}
      </div>
      {error && <div className="text-red-400 text-sm px-4 py-2">{error}</div>}
      <form
        onSubmit={async e => {
          e.preventDefault();
          if (!draft.trim()) return;
          const q = draft;
          setDraft('');
          setError('');
          try {
            await send(q);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            useChatStore.setState({ pending: false });
          }
        }}
        className="p-4 border-t border-zinc-800"
      >
        <input
          className="w-full bg-zinc-900 text-zinc-100 px-3 py-2 rounded"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Ask the wiki..."
        />
      </form>
    </div>
  );
}
