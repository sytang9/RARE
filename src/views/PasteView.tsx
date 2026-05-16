import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ingestSource } from '../ingest/orchestrate';
import { getSettings } from '../settings/settings';

export function PasteView() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');

  async function handleSubmit() {
    const settings = await getSettings();
    const vault = { root: settings.vault_path };
    setStatus('fetching...');
    if (/^https?:\/\//.test(input.trim())) {
      const { fetch } = await import('@tauri-apps/plugin-http');
      const resp = await fetch(input.trim());
      const html = await resp.text();
      const { htmlToMarkdown } = await import('../sources/url');
      const { title, markdown } = htmlToMarkdown(html, input.trim());
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
      const rawPath = `raw/sources/${slug}.md`;
      await invoke('write_file', { path: `${vault.root}/${rawPath}`, contents: markdown });
      setStatus('ingesting...');
      await ingestSource(vault, rawPath);
      setStatus('done');
    } else {
      setStatus('only URLs supported here; drag-drop a file for PDFs');
    }
    setInput('');
  }

  return (
    <div className="p-4">
      <textarea
        className="w-full h-32 bg-zinc-900 text-zinc-100 p-3 rounded"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Paste a URL..."
      />
      <button onClick={handleSubmit} className="mt-2 px-4 py-2 bg-zinc-200 text-zinc-900 rounded">
        Ingest
      </button>
      <p className="mt-2 text-sm text-zinc-500">{status}</p>
    </div>
  );
}
