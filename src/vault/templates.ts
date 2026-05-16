import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { VaultRoot } from './root';
import { ensureObsidianConfig } from '../lib/obsidian-config';

const PURPOSE_DEFAULT = `# Vault Purpose

This vault is a personal knowledge base I build by pasting links, articles,
and PDFs I want to remember.

## Key questions
- Write a few questions you want this vault to answer over time.

## Scope
- (Optional) Topics you want to keep out.

## Tone for chat answers
Direct, sourced, no preamble. Flag uncertainty.
`;

const SCHEMA_DEFAULT = `# Wiki Schema

## Page types
- **source**: one per ingested document.
- **entity**: people, organizations, products, places.
- **concept**: theories, methods, ideas, topics.

## Cross-linking
- Aggressively use [[wikilinks]] on first occurrence.
- Don't link from headings.

## Contradictions
- When new source contradicts existing claim: add a "Tensions" section
  to the affected page, cite both sources.
`;

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function initVault(vault: VaultRoot): Promise<void> {
  await mkdir(vault.root, { recursive: true });
  if (!await exists(join(vault.root, 'purpose.md'))) {
    await writeFile(join(vault.root, 'purpose.md'), PURPOSE_DEFAULT, 'utf-8');
  }
  if (!await exists(join(vault.root, 'schema.md'))) {
    await writeFile(join(vault.root, 'schema.md'), SCHEMA_DEFAULT, 'utf-8');
  }
  await ensureObsidianConfig(vault);
}
