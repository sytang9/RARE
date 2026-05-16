import { invoke } from '@tauri-apps/api/core';

const isTauri =
  typeof window !== 'undefined' &&
  typeof (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined';

export async function readFileText(path: string): Promise<string> {
  if (isTauri) {
    return invoke<string>('read_file_text', { path });
  }
  const { readFile } = await import('node:fs/promises');
  return readFile(path, 'utf-8');
}

export async function writeFileText(path: string, contents: string): Promise<void> {
  if (isTauri) {
    return invoke<void>('write_file', { path, contents });
  }
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf-8');
}

export async function appendFileText(path: string, content: string): Promise<void> {
  let existing = '';
  try {
    existing = await readFileText(path);
  } catch {
    // File may not exist yet
  }
  await writeFileText(path, existing + content);
}

export async function listDir(path: string): Promise<string[]> {
  if (isTauri) {
    return invoke<string[]>('list_dir', { path });
  }
  const { readdir } = await import('node:fs/promises');
  return readdir(path);
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await readFileText(path);
    return true;
  } catch {
    return false;
  }
}
