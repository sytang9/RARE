import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Search, FileText, Users, Lightbulb, ChevronRight, X, ExternalLink } from 'lucide-react';

type PageType = 'concept' | 'entity' | 'source';

interface PageMeta {
  id: string;
  title: string;
  type: PageType;
}

interface PageDetail {
  path: string;
  frontmatter: {
    type: PageType;
    title: string;
    sources: string[];
    created: string;
    updated: string;
  };
  body: string;
}

interface SourcePanel {
  path: string;       // raw/sources/foo.md
  text: string;
}

const TYPE_COLOR: Record<PageType, string> = {
  concept: '#f0a030',
  entity:  '#38bdf8',
  source:  '#34d399',
};

const TYPE_ICON: Record<PageType, React.ElementType> = {
  concept: Lightbulb,
  entity:  Users,
  source:  FileText,
};

const TYPE_LABEL: Record<PageType, string> = {
  concept: 'Concepts',
  entity:  'Entities',
  source:  'Sources',
};

function TypeBadge({ type }: { type: PageType }) {
  const color = TYPE_COLOR[type];
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: color + '50', background: color + '15' }}
    >
      {type}
    </span>
  );
}

// Slide-in panel showing raw source text
function SourceDrawer({ panel, onClose }: { panel: SourcePanel; onClose: () => void }) {
  const slug = panel.path.replace('raw/sources/', '').replace(/\.md$/, '');
  return (
    <div className="absolute inset-y-0 right-0 w-[480px] max-w-full bg-panel border-l border-rim flex flex-col z-20 shadow-2xl"
         style={{ animation: 'view-in 0.18s ease-out' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-rim shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={13} className="text-emerald-400 shrink-0" />
          <span className="text-[13px] font-mono text-ink truncate">{slug}</span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-ink-dim hover:text-ink hover:bg-card transition-colors"
        >
          <X size={13} />
        </button>
      </div>
      {/* Label */}
      <div className="px-5 py-2 border-b border-rim shrink-0">
        <span className="text-[10px] font-mono text-ink-dim uppercase tracking-widest">raw source</span>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <pre className="text-[11px] font-mono text-ink-dim leading-relaxed whitespace-pre-wrap break-words">
          {panel.text}
        </pre>
      </div>
    </div>
  );
}

export function WikiView() {
  const [pages, setPages]             = useState<PageMeta[]>([]);
  const [selected, setSelected]       = useState<PageDetail | null>(null);
  const [loading, setLoading]         = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [search, setSearch]           = useState('');
  const [error, setError]             = useState('');
  const [sourcePanel, setSourcePanel] = useState<SourcePanel | null>(null);
  const [sourcePanelLoading, setSourcePanelLoading] = useState(false);

  // slug → page id map (e.g. "attention" → "concepts/attention")
  const slugMap = useRef(new Map<string, string>());

  const loadPage = useCallback(async (id: string) => {
    setSourcePanel(null);
    setPageLoading(true);
    try {
      const r = await fetch(`/api/page?path=${encodeURIComponent(id)}`);
      const data = await r.json() as PageDetail;
      setSelected(data);
    } catch {
      setError('Failed to load page');
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/pages')
      .then(r => r.json())
      .then((data: PageMeta[]) => {
        setPages(data);
        const m = new Map<string, string>();
        for (const p of data) {
          m.set(p.id.split('/').pop()!, p.id);
          m.set(p.id, p.id);
        }
        slugMap.current = m;
        setLoading(false);
        // Auto-load page from ?wiki= URL param (used when opening wikilinks in new tab)
        const wikiParam = new URLSearchParams(window.location.search).get('wiki');
        if (wikiParam) loadPage(wikiParam);
      })
      .catch(() => { setError('Failed to load pages'); setLoading(false); });
  }, [loadPage]);

  const openSource = useCallback(async (sourcePath: string) => {
    setSourcePanelLoading(true);
    try {
      const r = await fetch(`/api/source?path=${encodeURIComponent(sourcePath)}`);
      const data = await r.json() as { path: string; text: string };
      setSourcePanel({ path: data.path, text: data.text });
    } catch {
      setError('Failed to load source');
    } finally {
      setSourcePanelLoading(false);
    }
  }, []);

  // Handle [[wikilink]] clicks: open the target page in a new tab
  const handleWikilink = useCallback((target: string) => {
    const id = slugMap.current.get(target) ?? slugMap.current.get(target.toLowerCase());
    if (id) window.open(`/?wiki=${encodeURIComponent(id)}`, '_blank');
  }, []);

  const filtered = pages.filter(p =>
    search === '' || p.title.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = (['concept', 'entity', 'source'] as PageType[]).reduce<Record<PageType, PageMeta[]>>(
    (acc, t) => ({ ...acc, [t]: filtered.filter(p => p.type === t) }),
    { concept: [], entity: [], source: [] },
  );

  function fmtTitle(t: string): string {
    if (!t) return t;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Convert [[wikilinks]] to markdown links prefixed with "wiki:" so we can intercept them
  function processBody(body: string): string {
    return body.replace(/\[\[([^\]]+)\]\]/g, (_, target) => `[${target}](wiki:${encodeURIComponent(target)})`);
  }

  const empty = !loading && pages.length === 0;

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Left panel: page list ──────────────────────────────── */}
      <div className="w-[260px] shrink-0 flex flex-col border-r border-rim bg-panel overflow-hidden">
        <div className="px-3 py-3 border-b border-rim">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-dim pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search pages…"
              className="w-full bg-card border border-rim rounded px-3 py-1.5 pl-7 text-xs text-ink placeholder:text-ink-dim input-amber-focus"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading && <p className="text-xs text-ink-dim px-4 py-3">Loading…</p>}
          {empty   && <p className="text-xs text-ink-dim px-4 py-3">No pages yet. Ingest some sources first.</p>}
          {(['concept', 'entity', 'source'] as PageType[]).map(type => {
            const group = grouped[type];
            if (group.length === 0) return null;
            const Icon = TYPE_ICON[type];
            return (
              <div key={type} className="mb-3">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <Icon size={11} style={{ color: TYPE_COLOR[type] }} />
                  <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: TYPE_COLOR[type] }}>
                    {TYPE_LABEL[type]} ({group.length})
                  </span>
                </div>
                {group.map(p => (
                  <button
                    key={p.id}
                    onClick={() => loadPage(p.id)}
                    className={[
                      'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                      selected?.path === p.id
                        ? 'bg-[rgba(240,160,48,0.08)] border-l-2 border-amber'
                        : 'hover:bg-card border-l-2 border-transparent',
                    ].join(' ')}
                  >
                    <span className="text-xs text-ink truncate flex-1">{fmtTitle(p.title)}</span>
                    <ChevronRight size={11} className="text-ink-dim shrink-0 opacity-50" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {!loading && pages.length > 0 && (
          <div className="px-3 py-2 border-t border-rim">
            <p className="text-[10px] font-mono text-ink-dim">{pages.length} pages</p>
          </div>
        )}
      </div>

      {/* ── Right panel: page content + optional source drawer ──── */}
      <div className="flex-1 min-w-0 overflow-hidden relative">
        <div className="h-full overflow-y-auto">
          {!selected && !pageLoading && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center select-none">
              <BookOpen size={28} className="text-ink-dim opacity-30" />
              <p className="text-sm text-ink-dim">Select a page to read.</p>
              <p className="text-xs text-ink-dim opacity-50">Pages are generated from ingested sources.</p>
            </div>
          )}

          {pageLoading && (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-ink-dim font-mono">loading…</p>
            </div>
          )}

          {error && (
            <div className="px-8 pt-8">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {selected && !pageLoading && (
            <div className="max-w-5xl mx-auto px-6 py-8">
              {/* Header */}
              <div className="mb-6 pb-5 border-b border-rim">
                <div className="flex items-start gap-3 mb-3">
                  <TypeBadge type={selected.frontmatter.type} />
                  <span className="text-[10px] font-mono text-ink-dim mt-0.5">
                    updated {new Date(selected.frontmatter.updated).toLocaleDateString()}
                  </span>
                </div>
                <h1 className="text-2xl font-semibold text-ink tracking-tight mb-3">
                  {fmtTitle(selected.frontmatter.title)}
                </h1>

                {/* Source references — clickable */}
                {selected.frontmatter.sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-[10px] font-mono text-ink-dim self-center">sources:</span>
                    {selected.frontmatter.sources.map(src => {
                      const slug = src.replace('raw/sources/', '').replace(/\.md$/, '');
                      return (
                        <button
                          key={src}
                          onClick={() => openSource(src)}
                          className={[
                            'flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded border transition-colors',
                            sourcePanel?.path === src
                              ? 'border-emerald-500/50 text-emerald-400 bg-emerald-900/20'
                              : 'border-rim text-ink-dim hover:border-emerald-500/40 hover:text-emerald-400',
                          ].join(' ')}
                        >
                          <ExternalLink size={10} />
                          {slug}
                        </button>
                      );
                    })}
                    {sourcePanelLoading && (
                      <span className="text-[10px] font-mono text-ink-dim self-center">loading…</span>
                    )}
                  </div>
                )}
              </div>

              {/* Body */}
              {selected.body.trim() ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  urlTransform={(url: string) => url}
                  components={{
                    a: ({ href, children }) => {
                      if (href?.includes('wiki:')) {
                        const target = decodeURIComponent(href.split('wiki:')[1]);
                        const exists = !!slugMap.current.get(target) || !!slugMap.current.get(target.toLowerCase());
                        if (!exists) return <span>{String(children)}</span>;
                        return (
                          <button
                            onClick={(e) => { e.preventDefault(); handleWikilink(target); }}
                            className="font-mono text-[0.85em] px-1 py-0.5 rounded underline underline-offset-2 transition-colors text-amber/80 hover:text-amber decoration-amber/40 hover:bg-[rgba(240,160,48,0.08)]"
                            title={`Go to ${target}`}
                          >
                            {String(children)}
                          </button>
                        );
                      }
                      return (
                        <a href={href} target="_blank" rel="noopener noreferrer"
                           className="text-amber/80 hover:text-amber underline decoration-amber/30">
                          {children}
                        </a>
                      );
                    },
                    h1: ({ children }) => <h1 className="text-xl font-semibold text-ink mt-7 mb-3">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-lg font-semibold text-ink mt-6 mb-2.5">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-base font-semibold text-ink mt-5 mb-2">{children}</h3>,
                    p: ({ children }) => <p className="text-base text-ink leading-7 mb-4">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside text-base text-ink space-y-1.5 mb-4 pl-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside text-base text-ink space-y-1.5 mb-4 pl-2">{children}</ol>,
                    li: ({ children }) => <li className="text-base text-ink leading-7">{children}</li>,
                    code: ({ children, className }) => className
                      ? <code className="block bg-card border border-rim rounded px-3 py-2 text-xs font-mono text-ink-dim overflow-x-auto mb-3">{children}</code>
                      : <code className="bg-card border border-rim rounded px-1.5 py-0.5 text-xs font-mono text-amber/80">{children}</code>,
                    blockquote: ({ children }) => <blockquote className="border-l-2 border-amber/30 pl-3 text-sm text-ink-dim italic mb-3">{children}</blockquote>,
                    hr: () => <hr className="border-rim my-5" />,
                    strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
                    em: ({ children }) => <em className="text-ink-dim">{children}</em>,
                  }}
                >
                  {processBody(selected.body)}
                </ReactMarkdown>
              ) : (
                <p className="text-sm text-ink-dim italic">No content yet.</p>
              )}
            </div>
          )}
        </div>

        {/* Source drawer — slides in over the right panel */}
        {sourcePanel && (
          <SourceDrawer panel={sourcePanel} onClose={() => setSourcePanel(null)} />
        )}
      </div>
    </div>
  );
}
