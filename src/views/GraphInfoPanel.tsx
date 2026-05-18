import { X, Link2 } from 'lucide-react';
import type { GraphNode } from '../vault/graph';

const TYPE_COLOR: Record<GraphNode['type'], string> = {
  concept: '#f0a030',
  entity:  '#38bdf8',
  source:  '#34d399',
};

const TYPE_LABEL: Record<GraphNode['type'], string> = {
  concept: 'concept',
  entity:  'entity',
  source:  'source',
};

interface Props {
  node: GraphNode & { neighbors?: GraphNode[] };
  onClose: () => void;
  onSelectNeighbour: (node: GraphNode) => void;
}

export function GraphInfoPanel({ node, onClose, onSelectNeighbour }: Props) {
  const color = TYPE_COLOR[node.type];

  return (
    <div className="absolute top-0 right-0 h-full w-[280px] bg-panel border-l border-rim flex flex-col z-10">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-rim gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink leading-snug break-words">{node.label}</p>
          <span
            className="inline-block mt-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full border"
            style={{ color, borderColor: color + '60', background: color + '15' }}
          >
            {TYPE_LABEL[node.type]}
          </span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-ink-dim hover:text-ink hover:bg-card transition-colors mt-0.5"
        >
          <X size={13} />
        </button>
      </div>

      {/* Connections count */}
      <div className="px-5 py-3 border-b border-rim">
        <div className="flex items-center gap-2 text-xs text-ink-dim">
          <Link2 size={12} />
          <span>{node.val} connection{node.val !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Neighbours */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {node.neighbors && node.neighbors.length > 0 ? (
          <>
            <p className="text-[10px] font-mono text-ink-dim uppercase tracking-widest mb-2">
              Connected to
            </p>
            <div className="space-y-0.5">
              {node.neighbors.map(n => (
                <button
                  key={n.id}
                  onClick={() => onSelectNeighbour(n)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded hover:bg-card transition-colors text-left"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: TYPE_COLOR[n.type] }}
                  />
                  <span className="text-xs text-ink truncate">{n.label}</span>
                  <span className="text-[10px] font-mono text-ink-dim ml-auto shrink-0">
                    {n.type[0]}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-ink-dim">No connections.</p>
        )}
      </div>
    </div>
  );
}
