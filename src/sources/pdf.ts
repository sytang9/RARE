export async function pdfToMarkdown(absPath: string): Promise<string> {
  if (!absPath || !absPath.endsWith('.pdf')) {
    throw new Error(`pdfToMarkdown: expected an absolute .pdf path, got: ${absPath}`);
  }
  if (typeof window === 'undefined') {
    // Node.js server path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = ((await import('pdf-parse')) as any).default;
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(absPath);
    const data = await pdfParse(buffer);
    return data.text as string;
  }
  // Tauri path
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('extract_pdf_text', { path: absPath });
  } catch (err: unknown) {
    throw new Error(err instanceof Error ? err.message : 'PDF extraction failed');
  }
}

export interface PdfDocumentBlock {
  type: 'document';
  source: {
    type: 'base64';
    media_type: 'application/pdf';
    data: string;
  };
}

export async function pdfToDocumentBlock(absPath: string): Promise<PdfDocumentBlock> {
  if (!absPath || !absPath.endsWith('.pdf')) {
    throw new Error(`pdfToDocumentBlock: expected an absolute .pdf path, got: ${absPath}`);
  }
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(absPath);
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: buffer.toString('base64'),
    },
  };
}
