import { useState } from 'react';
import { useChatStore } from '../state/chatStore';

export function ChatView() {
  const { messages, pending, send } = useChatStore();
  const [draft, setDraft] = useState('');

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
      <form
        onSubmit={async e => {
          e.preventDefault();
          if (!draft.trim()) return;
          const q = draft;
          setDraft('');
          await send(q);
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
