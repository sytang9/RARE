import { useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Search, FileText, Users, Lightbulb, ChevronRight } from 'lucide-react';

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

function WikilinkRenderer({ href, children }: { href?: string; children?: React.ReactNode }) {
  return (
    <span className="text-amber/80 hover:text-amber cursor-pointer underline decoration-amber/30">
      {children}
    </span>
  );
}

export function WikiView() {
  const [pages, setPages]         = useState<PageMeta[]>([]);
  const [selected, setSelected]   = useState<PageDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [search, setSearch]       = useState('');
  const [error, setError]         = useState('');

  useEffect(() => {
    fetch('/api/pages')
      .then(r => r.json())
      .then((data: PageMeta[]) => { setPages(data); setLoading(false); })
      .catch(() => { setError('Failed to load pages'); setLoading(false); });
  }, []);

  const loadPage = useCallback(async (id: string) => {
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

  const filtered = pages.filter(p =>
    search === '' || p.title.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = (['concept', 'entity', 'source'] as PageType[]).reduce<Record<PageType, PageMeta[]>>(
    (acc, t) => ({ ...acc, [t]: filtered.filter(p => p.type === t) }),
    { concept: [], entity: [], source: [] },
  );

  // Convert [[wikilinks]] in body to markdown links so react-markdown can handle them
  function processBody(body: string): string {
    return body.replace(/\[\[([^\]]+)\]\]/g, (_, target) => `[${target}](wiki:${target})`);
  }

  const empty = !loading && pages.length === 0;

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Left panel: page list ──────────────────────────────── */}
      <div className="w-[260px] shrink-0 flex flex-col border-r border-rim bg-panel overflow-hidden">
        {/* Search */}
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

        {/* Page list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading && (
            <p className="text-xs text-ink-dim px-4 py-3">Loading…</p>
          )}
          {empty && (
            <p className="text-xs text-ink-dim px-4 py-3">No pages yet. Ingest some sources first.</p>
          )}
          {(['concept', 'entity', 'source'] as PageType[]).map(type => {
            const group = grouped[type];
            if (group.length === 0) return null;
            const Icon = TYPE_ICON[type];
            return (
              <div key={type} className="mb-3">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <Icon size={11} style={{ color: TYPE_COLOR[type] }} />
                  <span
                    className="text-[10px] font-mono uppercase tracking-widest"
                    style={{ color: TYPE_COLOR[type] }}
                  >
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
                    <span className="text-xs text-ink truncate flex-1">{p.title}</span>
                    <ChevronRight size={11} className="text-ink-dim shrink-0 opacity-50" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {!loading && pages.length > 0 && (
          <div className="px-3 py-2 border-t border-rim">
            <p className="text-[10px] font-mono text-ink-dim">{pages.length} pages</p>
          </div>
        )}
      </div>

      {/* ── Right panel: page content ──────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
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
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {selected && !pageLoading && (
          <div className="max-w-2xl mx-auto px-8 py-8">
            {/* Header */}
            <div className="mb-6 pb-5 border-b border-rim">
              <div className="flex items-start gap-3 mb-3">
                <TypeBadge type={selected.frontmatter.type} />
                <span className="text-[10px] font-mono text-ink-dim mt-0.5">
                  updated {new Date(selected.frontmatter.updated).toLocaleDateString()}
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-ink tracking-tight">
                {selected.frontmatter.title}
              </h1>
              {selected.frontmatter.sources.length > 0 && (
                <p className="text-xs text-ink-dim mt-2 font-mono">
                  sources: {selected.frontmatter.sources.join(', ')}
                </p>
              )}
            </div>

            {/* Body */}
            {selected.body.trim() ? (
              <div className="prose prose-sm prose-invert max-w-none wiki-body">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) =>
                      href?.startsWith('wiki:') ? (
                        <WikilinkRenderer>{children}</WikilinkRenderer>
                      ) : (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber/80 hover:text-amber underline decoration-amber/30">
                          {children}
                        </a>
                      ),
                    h1: ({ children }) => <h1 className="text-lg font-semibold text-ink mt-6 mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-semibold text-ink mt-5 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold text-ink mt-4 mb-1.5">{children}</h3>,
                    p: ({ children }) => <p className="text-sm text-ink leading-relaxed mb-3">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside text-sm text-ink space-y-1 mb-3 pl-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-ink space-y-1 mb-3 pl-2">{children}</ol>,
                    li: ({ children }) => <li className="text-sm text-ink">{children}</li>,
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
              </div>
            ) : (
              <p className="text-sm text-ink-dim italic">No content yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
