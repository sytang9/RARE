export async function readFileText(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path, 'utf-8');
}

export async function writeFileText(path: string, contents: string): Promise<void> {
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
    // file may not exist yet
  }
  await writeFileText(path, existing + content);
}

export async function listDir(path: string): Promise<string[]> {
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
