import { vi } from 'vitest';
import type { ChatOptions, ChatResult } from '../../src/llm/anthropic';

export const mockChat = vi.fn<(opts: ChatOptions) => Promise<ChatResult>>();
export const mockChatStream = vi.fn();

export function resetAnthropicMocks() {
  mockChat.mockReset();
  mockChatStream.mockReset();
}

export function mockChatOnce(result: Partial<ChatResult>): void {
  mockChat.mockResolvedValueOnce({
    text: '',
    inputTokens: 100,
    outputTokens: 50,
    usd: 0.001,
    ...result,
  });
}

vi.mock('../../src/llm/anthropic', () => ({
  initAnthropic: vi.fn(),
  chat: mockChat,
  chatStream: mockChatStream,
}));
