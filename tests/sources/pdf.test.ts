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
});
