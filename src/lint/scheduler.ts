import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runLint } from './run';
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
    const log = await readFile(join(wikiDir(vault), 'log.md'), 'utf-8');
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
  const last = await lastLintRun(vault);
  if (!shouldRunLint(last, intervalHours)) return false;
  onStart?.();
  await runLint(vault);
  return true;
}
