import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { wikiDir, type VaultRoot } from './root';

export interface LogEntry {
  event: 'ingest' | 'query' | 'lint';
  title: string;
  detail?: Record<string, unknown>;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function appendLog(vault: VaultRoot, entry: LogEntry): Promise<void> {
  const path = join(wikiDir(vault), 'log.md');
  await mkdir(wikiDir(vault), { recursive: true });
  let block = `\n## [${timestamp()}] ${entry.event} | ${entry.title}\n`;
  if (entry.detail) {
    for (const [k, v] of Object.entries(entry.detail)) {
      block += `- ${k}: ${JSON.stringify(v)}\n`;
    }
  }
  await appendFile(path, block, 'utf-8');
}
