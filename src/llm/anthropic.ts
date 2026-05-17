import Anthropic from '@anthropic-ai/sdk';
import { computeUsd, type ModelTier } from './cost';

let client: Anthropic | null = null;

const MODEL_IDS: Record<ModelTier, string> = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-7',
};

export type { ModelTier };

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
