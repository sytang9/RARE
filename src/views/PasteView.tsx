import { useState } from 'react';

export function PasteView() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');

  async function handleSubmit() {
    if (!input.trim()) return;
    const val = input.trim();
    setInput('');
    setStatus('submitting...');
    try {
      if (/^https?:\/\//.test(val)) {
        const r = await fetch('/api/ingest/url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: val }),
        });
        const json = await r.json() as { jobId?: number; error?: string };
        if (!r.ok) throw new Error(json.error ?? 'Ingest failed');
        setStatus(`Queued (job #${json.jobId})`);
      } else if (val.startsWith('/')) {
        const r = await fetch('/api/ingest/path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: val }),
        });
        const json = await r.json() as { jobId?: number; error?: string };
        if (!r.ok) throw new Error(json.error ?? 'Ingest failed');
        setStatus(`Queued (job #${json.jobId})`);
      } else {
        setStatus('Paste a URL (https://...) or absolute file path (/path/to/file.pdf)');
      }
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : 'Something went wrong'}`);
    }
  }

  return (
    <div className="p-4">
      <textarea
        className="w-full h-32 bg-zinc-900 text-zinc-100 p-3 rounded"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Paste a URL (https://...) or absolute file path..."
      />
      <button onClick={handleSubmit} className="mt-2 px-4 py-2 bg-zinc-200 text-zinc-900 rounded">
        Ingest
      </button>
      <p className="mt-2 text-sm text-zinc-500">{status}</p>
    </div>
  );
}
