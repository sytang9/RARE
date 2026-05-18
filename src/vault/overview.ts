import overviewTemplate from '../../prompts/overview.md?raw';
import { chat } from '../llm/anthropic';
import { writeFileText } from '../lib/fs';
import { pathJoin } from '../lib/path';
import { wikiDir, type VaultRoot } from './root';

export async function regenerateOverview(
  vault: VaultRoot,
  purpose: string,
  indexBody: string,
): Promise<void> {
  const prompt = overviewTemplate.replace('{{purpose}}', purpose).replace('{{index}}', indexBody);
  const result = await chat({
    model: 'haiku',
    system: 'Summarize the wiki concisely.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1024,
  });
  await writeFileText(pathJoin(wikiDir(vault), 'overview.md'), result.text);
}
