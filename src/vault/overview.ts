import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat } from '../llm/anthropic';
import { wikiDir, type VaultRoot } from './root';

export async function regenerateOverview(
  vault: VaultRoot,
  purpose: string,
  indexBody: string,
): Promise<void> {
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '../../prompts/overview.md');
  const template = await readFile(promptPath, 'utf-8');
  const prompt = template.replace('{{purpose}}', purpose).replace('{{index}}', indexBody);
  const result = await chat({
    model: 'haiku',
    system: 'Summarize the wiki concisely.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1024,
  });
  await mkdir(wikiDir(vault), { recursive: true });
  await writeFile(join(wikiDir(vault), 'overview.md'), result.text, 'utf-8');
}
