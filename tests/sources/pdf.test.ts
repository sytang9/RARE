import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { pdfToMarkdown } from '../../src/sources/pdf';

describe('sources.pdf.pdfToMarkdown', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValueOnce('RARE test fixture\n');
  });

  it('invokes extract_pdf_text and returns the text', async () => {
    const result = await pdfToMarkdown('/some/path/doc.pdf');
    expect(invoke).toHaveBeenCalledWith('extract_pdf_text', { path: '/some/path/doc.pdf' });
    expect(result).toBe('RARE test fixture\n');
  });

  it('throws on non-pdf path', async () => {
    await expect(pdfToMarkdown('/some/path/doc.txt')).rejects.toThrow('expected an absolute .pdf path');
  });

  it('propagates invoke rejection as an Error', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockRejectedValueOnce(new Error('pdf parse error'));
    await expect(pdfToMarkdown('/bad.pdf')).rejects.toThrow('pdf parse error');
  });
});
