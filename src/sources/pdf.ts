import { invoke } from '@tauri-apps/api/core';

export async function pdfToMarkdown(absPath: string): Promise<string> {
  if (!absPath || !absPath.endsWith('.pdf')) {
    throw new Error(`pdfToMarkdown: expected an absolute .pdf path, got: ${absPath}`);
  }
  try {
    return await invoke<string>('extract_pdf_text', { path: absPath });
  } catch (err: unknown) {
    throw new Error(err instanceof Error ? err.message : 'PDF extraction failed');
  }
}
