import { create } from 'zustand';
import type { Message } from '../chat/answer';

interface ChatState {
  messages: Message[];
  pending: boolean;
  send: (text: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  pending: false,
  async send(text) {
    set(s => ({ messages: [...s.messages, { role: 'user', content: text }], pending: true }));
    const { answer } = await import('../chat/answer');
    const { getSettings } = await import('../settings/settings');
    const { vault_path } = await getSettings();
    const result = await answer(text, get().messages, { root: vault_path });
    set(s => ({
      messages: [...s.messages, { role: 'assistant', content: result.text }],
      pending: false,
    }));
  },
}));
