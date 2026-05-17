import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Circle, CheckCircle2, XCircle, Loader2, FileText, Upload } from 'lucide-react';

type TaskStatus = 'pending' | 'processing' | 'done' | 'failed';

interface QueueTask {
  id: number;
  source_path: string;
  status: TaskStatus;
  error?: string;
  created_at: string;
}

interface IngestResult {
  jobId?: number;
  error?: string;
  cached?: boolean;
}

function inputType(val: string): 'url' | 'path' | null {
  if (/^https?:\/\//i.test(val)) return 'url';
  if (val.startsWith('/')) return 'path';
  return null;
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'done')       return <CheckCircle2 size={13} className="text-green-500 shrink-0" />;
  if (status === 'failed')     return <XCircle      size={13} className="text-red-500 shrink-0" />;
  if (status === 'processing') return <Loader2      size={13} className="text-amber animate-spin shrink-0" />;
  return <Circle size={13} className="text-ink-dim shrink-0" />;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const cls: Record<TaskStatus, string> = {
    done:       'bg-green-900/40 text-green-400 border-green-700/40',
    failed:     'bg-red-900/40 text-red-400 border-red-700/40',
    processing: 'border-amber/40 text-amber',
    pending:    'border-rim text-ink-dim',
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cls[status]}`}>
      {status}
    </span>
  );
}

export function PasteView() {
  const [input, setInput]         = useState('');
  const [busy, setBusy]           = useState(false);
  const [notice, setNotice]       = useState('');
  const [jobs, setJobs]           = useState<QueueTask[]>([]);
  const [dragOver, setDragOver]   = useState(false);
  const [pdfFile, setPdfFile]     = useState<File | null>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef  = useRef<HTMLInputElement>(null);

  const type = inputType(input.trim());

  function startPoll() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch('/api/queue');
        const data = (await r.json()) as QueueTask[];
        setJobs(data.slice().reverse());
        const active = data.some(j => j.status === 'pending' || j.status === 'processing');
        if (!active) stopPoll();
      } catch { /* ignore */ }
    }, 1500);
  }

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function refreshQueue() {
    try {
      const r = await fetch('/api/queue');
      const data = (await r.json()) as QueueTask[];
      setJobs(data.slice().reverse());
    } catch { /* ignore */ }
  }

  useEffect(() => { refreshQueue(); return stopPoll; }, []);

  async function enqueueResult(r: Response) {
    const json = await r.json() as IngestResult;
    if (!r.ok) throw new Error(json.error ?? 'Ingest failed');
    setNotice(`Queued as job #${json.jobId}${json.cached ? ' (cached)' : ''}`);
    startPoll();
    await refreshQueue();
  }

  async function submitText() {
    const val = input.trim();
    if (!val || !type || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const endpoint = type === 'url' ? '/api/ingest/url' : '/api/ingest/path';
      const body = type === 'url' ? { url: val } : { path: val };
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await enqueueResult(r);
      setInput('');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function uploadPdf(file: File) {
    setBusy(true);
    setNotice('');
    try {
      const r = await fetch('/api/ingest/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', 'X-Filename': file.name },
        body: file,
      });
      await enqueueResult(r);
      setPdfFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPdfFile(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') {
      setPdfFile(file);
    } else {
      setNotice('Only PDF files can be dropped here');
    }
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitText();
    }
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-ink mb-1">Ingest Source</h1>
          <p className="text-sm text-ink-dim">Add a URL, file path, or PDF to your knowledge base.</p>
        </div>

        {/* URL / path input */}
        <div>
          <div className="relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={"https://example.com/article\n/home/you/papers/transformer.pdf"}
              rows={3}
              className={[
                'w-full bg-card border rounded-lg px-4 py-3 font-mono text-sm text-ink input-amber-focus',
                'placeholder:text-ink-dim resize-none',
                type ? 'border-amber/40' : 'border-rim',
              ].join(' ')}
            />
            {type && (
              <span className="absolute top-3 right-3 text-[10px] font-mono text-amber/70 bg-card px-1.5 py-0.5 rounded border border-amber/20">
                {type === 'url' ? 'URL' : 'FILE'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={submitText}
              disabled={!type || busy}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all',
                type && !busy
                  ? 'text-black hover:opacity-90 active:scale-95'
                  : 'bg-card text-ink-dim border border-rim cursor-not-allowed',
              ].join(' ')}
              style={type && !busy ? { background: 'var(--color-amber)' } : undefined}
            >
              {busy && !pdfFile ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              Ingest
            </button>
            <span className="text-xs text-ink-dim">⌘↵ to submit</span>
            {notice && (
              <span className={`text-xs ml-auto ${notice.startsWith('Queued') ? 'text-green-400' : 'text-red-400'}`}>
                {notice}
              </span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-rim" />
          <span className="text-xs text-ink-dim font-mono">or upload a PDF</span>
          <div className="flex-1 h-px bg-rim" />
        </div>

        {/* PDF drop zone */}
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !pdfFile && fileRef.current?.click()}
            className={[
              'rounded-lg border-2 border-dashed transition-all cursor-pointer',
              'flex flex-col items-center justify-center py-8 gap-3',
              dragOver
                ? 'border-amber bg-[rgba(240,160,48,0.06)]'
                : pdfFile
                  ? 'border-amber/40 bg-[rgba(240,160,48,0.04)]'
                  : 'border-rim hover:border-ink-dim',
            ].join(' ')}
            style={dragOver ? {
              boxShadow: '0 0 28px rgba(240,160,48,0.18), inset 0 0 28px rgba(240,160,48,0.05)',
            } : undefined}
          >
            {pdfFile ? (
              <>
                <FileText size={22} className="text-amber" />
                <div className="text-center">
                  <p className="text-sm font-mono text-ink truncate max-w-xs">{pdfFile.name}</p>
                  <p className="text-xs text-ink-dim mt-0.5">{(pdfFile.size / 1024).toFixed(0)} KB</p>
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={e => { e.stopPropagation(); uploadPdf(pdfFile); }}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-black transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--color-amber)' }}
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    Upload &amp; Ingest
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setPdfFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="px-3 py-1.5 rounded text-xs text-ink-dim border border-rim hover:text-ink transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </>
            ) : (
              <>
                <Upload size={22} className="text-ink-dim" />
                <div className="text-center">
                  <p className="text-sm text-ink-dim">Drop a PDF here</p>
                  <p className="text-xs text-ink-dim opacity-60 mt-0.5">or click to browse</p>
                </div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileSelect} />
        </div>

        {/* Queue */}
        {jobs.length > 0 && (
          <div>
            <p className="text-[11px] font-mono text-ink-dim uppercase tracking-widest mb-3">Recent Jobs</p>
            <div className="space-y-1">
              {jobs.slice(0, 12).map(job => (
                <div
                  key={job.id}
                  className={[
                    'relative flex items-center gap-3 px-3 py-2.5 rounded bg-card border overflow-hidden',
                    job.status === 'processing' ? 'border-amber/20' : 'border-rim',
                  ].join(' ')}
                >
                  {/* scan shimmer on in-flight jobs */}
                  {job.status === 'processing' && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(240,160,48,0.07), transparent)',
                        animation: 'scan 2s linear infinite',
                      }}
                    />
                  )}
                  <StatusIcon status={job.status} />
                  <span className="text-[11px] text-ink-dim font-mono mr-auto truncate min-w-0 relative">
                    {job.source_path.split('/').slice(-2).join('/')}
                  </span>
                  <StatusBadge status={job.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
