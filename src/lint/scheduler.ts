import { readFileText } from '../lib/fs';
import { pathJoin } from '../lib/path';
import { runLint } from './run';
import { listPages } from '../vault/page';
import { wikiDir, type VaultRoot } from '../vault/root';

export function shouldRunLint(
  lastRun: Date | null,
  intervalHours: number,
  now: Date = new Date(),
): boolean {
  if (!lastRun) return true;
  const elapsedHours = (now.getTime() - lastRun.getTime()) / 36e5;
  return elapsedHours >= intervalHours;
}

export async function lastLintRun(vault: VaultRoot): Promise<Date | null> {
  try {
    const log = await readFileText(pathJoin(wikiDir(vault), 'log.md'));
    const matches = [...log.matchAll(/^## \[([\d-: ]+)\] lint \|/gm)];
    if (!matches.length) return null;
    const last = matches[matches.length - 1][1];
    return new Date(last.replace(' ', 'T') + ':00Z');
  } catch { return null; }
}

export async function maybeRunLint(
  vault: VaultRoot,
  intervalHours: number,
  onStart?: () => void,
): Promise<boolean> {
  // Nothing to lint if vault has no pages yet
  const pages = await listPages(vault);
  if (pages.length === 0) return false;
  const last = await lastLintRun(vault);
  if (!shouldRunLint(last, intervalHours)) return false;
  onStart?.();
  await runLint(vault);
  return true;
}
