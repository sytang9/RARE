export async function pdfToMarkdown(absPath: string): Promise<string> {
  if (!absPath || !absPath.endsWith('.pdf')) {
    throw new Error(`pdfToMarkdown: expected an absolute .pdf path, got: ${absPath}`);
  }
  // pdf-parse v2 exports a named class PDFParse, not a default function
  const { PDFParse } = await import('pdf-parse');
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(absPath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
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
