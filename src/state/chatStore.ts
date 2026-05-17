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
