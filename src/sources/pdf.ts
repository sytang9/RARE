import { invoke } from '@tauri-apps/api/core';

export async function pdfToMarkdown(absPath: string): Promise<string> {
  const text = await invoke<string>('extract_pdf_text', { path: absPath });
  return text;
}
