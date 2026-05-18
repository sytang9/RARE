import { create } from 'zustand';
import type { ModelTier } from '../llm/anthropic';

export interface Message { role: 'user' | 'assistant'; content: string; }

export interface SendOpts {
  model?: ModelTier;
  thinking?: boolean;
}

export interface ChatSummary {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatState {
  chatId: number | null;
  messages: Message[];
  pending: boolean;
  chatList: ChatSummary[];
  send: (text: string, opts?: SendOpts) => Promise<void>;
  loadChat: (id: number) => Promise<void>;
  newChat: () => void;
  deleteChat: (id: number) => Promise<void>;
  loadHistory: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chatId: null,
  messages: [],
  pending: false,
  chatList: [],

  newChat() {
    set({ chatId: null, messages: [] });
  },

  async loadHistory() {
    try {
      const r = await fetch('/api/chats');
      if (!r.ok) return;
      set({ chatList: await r.json() as ChatSummary[] });
    } catch { /* non-fatal */ }
  },

  async loadChat(id: number) {
    try {
      const r = await fetch(`/api/chats/${id}/messages`);
      if (!r.ok) return;
      set({ chatId: id, messages: await r.json() as Message[] });
    } catch { /* non-fatal */ }
  },

  async deleteChat(id: number) {
    try {
      await fetch(`/api/chats/${id}`, { method: 'DELETE' });
    } catch { /* non-fatal */ }
    const { chatId, chatList } = get();
    const newList = chatList.filter(c => c.id !== id);
    if (chatId === id) {
      set({ chatId: null, messages: [], chatList: newList });
    } else {
      set({ chatList: newList });
    }
  },

  async send(text, opts = {}) {
    const { chatId } = get();
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
          chatId,
        }),
      });
      const json = await r.json() as { text?: string; error?: string; chatId?: number };
      if (!r.ok) throw new Error(json.error ?? 'Chat failed');
      set(s => ({
        chatId: json.chatId ?? s.chatId,
        messages: [...s.messages, { role: 'assistant', content: json.text ?? '' }],
        pending: false,
      }));
      get().loadHistory();
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
