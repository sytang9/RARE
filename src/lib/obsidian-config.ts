import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { VaultRoot } from '../vault/root';

const APP_JSON = {
  alwaysUpdateLinks: true,
  useMarkdownLinks: false,
  newLinkFormat: 'shortest',
  attachmentFolderPath: 'raw/assets',
};

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureObsidianConfig(vault: VaultRoot): Promise<void> {
  const dir = join(vault.root, '.obsidian');
  await mkdir(dir, { recursive: true });
  const appPath = join(dir, 'app.json');
  if (!await exists(appPath)) {
    await writeFile(appPath, JSON.stringify(APP_JSON, null, 2), 'utf-8');
  }
}
