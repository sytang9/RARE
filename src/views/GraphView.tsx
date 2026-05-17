import { useCallback, useEffect, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from 'react-force-graph-2d';
import { RotateCcw } from 'lucide-react';
import type { GraphData, GraphNode, GraphLink } from '../vault/graph';
import { GraphInfoPanel } from './GraphInfoPanel';

// ── type aliases so force-graph's extended objects stay typed ─────────────────
type FGNode = NodeObject & GraphNode;
type FGLink = LinkObject & GraphLink;

// ── design constants ───────────────────────────────────────────────────────────
const NODE_COLOR: Record<GraphNode['type'], string> = {
  concept: '#f0a030',
  entity:  '#38bdf8',
  source:  '#34d399',
};

const BG         = '#09090e';
const LINK_DIM   = 'rgba(30, 30, 42, 0.9)';
const LINK_HOT   = 'rgba(240, 160, 48, 0.55)';

// ── helpers ────────────────────────────────────────────────────────────────────

function hex(color: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return color + a;
}

function nodeRadius(node: FGNode): number {
  return Math.sqrt(node.val) * 5;
}

// ── component ──────────────────────────────────────────────────────────────────
export function GraphView() {
  const fgRef       = useRef<ForceGraphMethods<NodeObject, LinkObject>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims,     setDims]     = useState({ width: 800, height: 600 });
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [hovered,  setHovered]  = useState<FGNode | null>(null);
  const [selected, setSelected] = useState<FGNode | null>(null);

  // resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDims({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // fetch graph data
  useEffect(() => {
    fetch('/api/graph')
      .then(r => r.json())
      .then((d: GraphData) => { setGraphData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  // Build neighbour map so info panel can list connected nodes
  const neighbourMap = useRef(new Map<string, FGNode[]>());
  useEffect(() => {
    const m = new Map<string, FGNode[]>();
    const nodeById = new Map<string, FGNode>(
      graphData.nodes.map(n => [n.id as string, n as FGNode]),
    );
    for (const l of graphData.links) {
      const s = typeof l.source === 'object' ? (l.source as FGNode).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as FGNode).id : l.target;
      const sNode = nodeById.get(s as string);
      const tNode = nodeById.get(t as string);
      if (sNode && tNode) {
        m.set(s as string, [...(m.get(s as string) ?? []), tNode]);
        m.set(t as string, [...(m.get(t as string) ?? []), sNode]);
      }
    }
    neighbourMap.current = m;
  }, [graphData]);

  // Hot set — ids of hovered node + its neighbours (for link highlight)
  const hotIds = useRef(new Set<string>());
  useEffect(() => {
    if (!hovered && !selected) { hotIds.current = new Set(); return; }
    const focus = selected ?? hovered;
    if (!focus) return;
    const id = focus.id as string;
    hotIds.current = new Set([id, ...(neighbourMap.current.get(id) ?? []).map(n => n.id as string)]);
  }, [hovered, selected]);

  // ── node paint ──────────────────────────────────────────────────────────────
  const nodeCanvasObject = useCallback((node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n   = node as FGNode;
    const r   = nodeRadius(n);
    const c   = NODE_COLOR[n.type] ?? '#f0a030';
    const id  = n.id as string;
    const hot = hotIds.current.has(id);
    const sel = selected?.id === id;

    ctx.save();

    if (sel) {
      // outer pulse ring
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, r + 5, 0, 2 * Math.PI);
      ctx.strokeStyle = hex(c, 0.35);
      ctx.lineWidth   = 3;
      ctx.shadowColor = c;
      ctx.shadowBlur  = 18;
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }

    // glow
    ctx.shadowColor = c;
    ctx.shadowBlur  = hot || sel ? 14 : 6;

    // filled disc
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
    ctx.fillStyle = hex(c, hot || sel ? 0.22 : 0.13);
    ctx.fill();

    // ring
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
    ctx.strokeStyle = hex(c, hot || sel ? 1.0 : 0.6);
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // label — only at sufficient zoom
    if (globalScale >= 1.4) {
      const fontSize = 11 / globalScale;
      ctx.font         = `${fontSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle    = hot || sel ? '#e8e8ef' : 'rgba(232,232,239,0.55)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(n.label, n.x!, n.y! + r + 2 / globalScale);
    }

    ctx.restore();
  }, [selected]);

  // ── node pointer area ───────────────────────────────────────────────────────
  const nodePointerAreaPaint = useCallback((node: NodeObject, color: string, ctx: CanvasRenderingContext2D) => {
    const n = node as FGNode;
    const r = nodeRadius(n) + 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  // ── link colour ─────────────────────────────────────────────────────────────
  const getLinkColor = useCallback((link: LinkObject) => {
    const l  = link as FGLink;
    const sid = typeof l.source === 'object' ? (l.source as FGNode).id : l.source;
    const tid = typeof l.target === 'object' ? (l.target as FGNode).id : l.target;
    return (hotIds.current.has(sid as string) || hotIds.current.has(tid as string))
      ? LINK_HOT
      : LINK_DIM;
  }, []);

  const getLinkWidth = useCallback((link: LinkObject) => {
    const l  = link as FGLink;
    const sid = typeof l.source === 'object' ? (l.source as FGNode).id : l.source;
    const tid = typeof l.target === 'object' ? (l.target as FGNode).id : l.target;
    return (hotIds.current.has(sid as string) || hotIds.current.has(tid as string)) ? 1.5 : 0.8;
  }, []);

  // ── interaction ─────────────────────────────────────────────────────────────
  function handleNodeClick(node: NodeObject) {
    const n = node as FGNode;
    setSelected(prev => (prev?.id === n.id ? null : n));
    fgRef.current?.centerAt(n.x, n.y, 600);
    fgRef.current?.zoom(3.5, 600);
  }

  function handleNodeHover(node: NodeObject | null) {
    setHovered(node ? node as FGNode : null);
  }

  function handleBackgroundClick() {
    setSelected(null);
  }

  function fitAll() {
    fgRef.current?.zoomToFit(400, 60);
  }

  // ── selected node with neighbours for info panel ────────────────────────────
  const selectedWithNeighbours = selected
    ? { ...selected, neighbors: neighbourMap.current.get(selected.id as string) ?? [] }
    : null;

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-base">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-ink-dim font-mono">loading graph…</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && graphData.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <p className="text-sm text-ink-dim">No pages in wiki yet.</p>
          <p className="text-xs text-ink-dim opacity-60">Ingest some sources first.</p>
        </div>
      )}

      {!loading && !error && graphData.nodes.length > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dims.width}
          height={dims.height}
          graphData={graphData as unknown as { nodes: NodeObject[]; links: LinkObject[] }}
          backgroundColor={BG}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => 'replace'}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkColor={getLinkColor}
          linkWidth={getLinkWidth}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onBackgroundClick={handleBackgroundClick}
          cooldownTicks={120}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 60)}
          autoPauseRedraw={false}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      )}

      {/* Fit-all button — top-right */}
      {graphData.nodes.length > 0 && (
        <button
          onClick={fitAll}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded bg-panel border border-rim text-ink-dim hover:text-ink hover:border-ink-dim transition-colors"
          title="Fit all"
        >
          <RotateCcw size={13} />
        </button>
      )}

      {/* Legend — bottom-left */}
      {graphData.nodes.length > 0 && (
        <div className="absolute bottom-4 left-4 flex items-center gap-4 px-3 py-2 rounded bg-panel/80 border border-rim backdrop-blur-sm">
          {(['concept', 'entity', 'source'] as GraphNode['type'][]).map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: NODE_COLOR[t], boxShadow: `0 0 4px ${NODE_COLOR[t]}` }}
              />
              <span className="text-[10px] font-mono text-ink-dim">{t}</span>
            </div>
          ))}
          <span className="text-[10px] font-mono text-ink-dim border-l border-rim pl-3">
            {graphData.nodes.length}n · {graphData.links.length}e
          </span>
        </div>
      )}

      {/* Info panel */}
      {selectedWithNeighbours && (
        <GraphInfoPanel
          node={selectedWithNeighbours}
          onClose={() => setSelected(null)}
          onSelectNeighbour={n => {
            setSelected(n as FGNode);
            fgRef.current?.centerAt((n as FGNode).x, (n as FGNode).y, 600);
            fgRef.current?.zoom(3.5, 600);
          }}
        />
      )}
    </div>
  );
}
