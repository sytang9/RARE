import { useCallback, useEffect, useState } from 'react';
import { Trash2, FileText, ChevronDown, ChevronRight, AlertTriangle, X } from 'lucide-react';

interface SourceMeta {
  slug: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string;
}

interface SourceDetail {
  path: string;
  text: string;
}

interface DeleteResult {
  deleted: string;
  cascadePages: string[];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ConfirmDialog({ title, body, onConfirm, onCancel }: {
  title: string; body: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-panel border border-rim rounded-lg w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-start justify-between px-5 py-4 border-b border-rim gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={15} className="text-red-400 shrink-0" />
            <p className="text-sm font-semibold text-ink">{title}</p>
          </div>
          <button onClick={onCancel} className="text-ink-dim hover:text-ink transition-colors mt-0.5">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-dim leading-relaxed">{body}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-rim">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs text-ink-dim border border-rim hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-500 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function SourcesView() {
  const [sources, setSources]         = useState<SourceMeta[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [preview, setPreview]         = useState<Record<string, SourceDetail>>({});
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [notice, setNotice]           = useState('');
  const [error, setError]             = useState('');

  async function load() {
    try {
      const r = await fetch('/api/sources');
      const data = await r.json() as SourceMeta[];
      setSources(data.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)));
    } catch {
      setError('Failed to load sources');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const toggleExpand = useCallback(async (path: string) => {
    if (expanded === path) { setExpanded(null); return; }
    setExpanded(path);
    if (preview[path]) return;
    setPreviewLoading(path);
    try {
      const r = await fetch(`/api/source?path=${encodeURIComponent(path)}`);
      const data = await r.json() as SourceDetail;
      setPreview(prev => ({ ...prev, [path]: data }));
    } catch { /* ignore preview errors */ }
    finally { setPreviewLoading(null); }
  }, [expanded, preview]);

  async function confirmDelete(path: string) {
    setConfirmPath(null);
    setDeleting(path);
    setNotice('');
    try {
      const r = await fetch(`/api/source?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
      const result = await r.json() as DeleteResult;
      const pages = result.cascadePages.length;
      setNotice(pages > 0
        ? `Deleted source and ${pages} wiki page${pages !== 1 ? 's' : ''}.`
        : 'Source deleted.');
      if (expanded === path) setExpanded(null);
      await load();
      setTimeout(() => setNotice(''), 4000);
    } catch {
      setError('Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-ink mb-1">Sources</h1>
          <p className="text-sm text-ink-dim">
            Raw sources ingested into the vault.
            Deleting a source also removes the wiki pages generated from it.
          </p>
        </div>

        {notice && (
          <div className="mb-4 px-3 py-2 rounded bg-green-900/30 border border-green-700/30 text-xs text-green-400">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 px-3 py-2 rounded bg-red-900/30 border border-red-700/30 text-xs text-red-400">
            {error}
          </div>
        )}

        {loading && (
          <p className="text-sm text-ink-dim">Loading…</p>
        )}

        {!loading && sources.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <FileText size={24} className="text-ink-dim opacity-30" />
            <p className="text-sm text-ink-dim">No sources yet.</p>
            <p className="text-xs text-ink-dim opacity-60">
              Paste a URL or upload a PDF from the Ingest tab.
            </p>
          </div>
        )}

        {!loading && sources.length > 0 && (
          <div className="space-y-2">
            {sources.map(src => {
              const isExpanded = expanded === src.path;
              const isDeleting = deleting === src.path;
              const pdata      = preview[src.path];

              return (
                <div
                  key={src.path}
                  className={[
                    'bg-card border rounded-lg overflow-hidden transition-colors',
                    isExpanded ? 'border-amber/20' : 'border-rim',
                  ].join(' ')}
                >
                  {/* Row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => toggleExpand(src.path)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      {isExpanded
                        ? <ChevronDown size={14} className="text-amber shrink-0" />
                        : <ChevronRight size={14} className="text-ink-dim shrink-0" />
                      }
                      <FileText size={14} className={isExpanded ? 'text-amber shrink-0' : 'text-ink-dim shrink-0'} />
                      <span className="text-sm font-mono text-ink truncate">{src.slug}</span>
                    </button>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono text-ink-dim hidden sm:block">
                        {formatBytes(src.sizeBytes)}
                      </span>
                      <span className="text-[11px] font-mono text-ink-dim hidden sm:block">
                        {formatDate(src.modifiedAt)}
                      </span>
                      <button
                        onClick={() => setConfirmPath(src.path)}
                        disabled={isDeleting}
                        className="w-7 h-7 flex items-center justify-center rounded text-ink-dim hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                        title="Delete source and cascade wiki pages"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Preview */}
                  {isExpanded && (
                    <div className="border-t border-rim">
                      {previewLoading === src.path && (
                        <p className="text-xs text-ink-dim font-mono px-4 py-3">loading preview…</p>
                      )}
                      {pdata && (
                        <pre className="px-4 py-3 text-[11px] font-mono text-ink-dim leading-relaxed whitespace-pre-wrap break-all max-h-64 overflow-y-auto bg-base/50">
                          {pdata.text.slice(0, 1500)}{pdata.text.length > 1500 ? '\n…' : ''}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && sources.length > 0 && (
          <p className="text-[11px] font-mono text-ink-dim mt-4">{sources.length} source{sources.length !== 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmPath && (
        <ConfirmDialog
          title="Delete source?"
          body={`This will delete "${confirmPath.replace('raw/sources/', '')}" and all wiki pages generated from it. This cannot be undone.`}
          onConfirm={() => confirmDelete(confirmPath)}
          onCancel={() => setConfirmPath(null)}
        />
      )}
    </div>
  );
}
