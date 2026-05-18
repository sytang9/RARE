import { writeFileText, fileExists } from './fs';
import { pathJoin } from './path';
import type { VaultRoot } from '../vault/root';

const APP_JSON = {
  alwaysUpdateLinks: true,
  useMarkdownLinks: false,
  newLinkFormat: 'shortest',
  attachmentFolderPath: 'raw/assets',
};

export async function ensureObsidianConfig(vault: VaultRoot): Promise<void> {
  const appPath = pathJoin(vault.root, '.obsidian', 'app.json');
  if (!await fileExists(appPath)) {
    await writeFileText(appPath, JSON.stringify(APP_JSON, null, 2));
  }
}
