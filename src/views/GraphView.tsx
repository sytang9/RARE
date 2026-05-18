import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from 'react-force-graph-2d';
import { forceCollide } from 'd3-force-3d';
import { RotateCcw, Search, X } from 'lucide-react';
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
  const fgRef        = useRef<ForceGraphMethods<NodeObject, LinkObject>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims,      setDims]      = useState({ width: 800, height: 600 });
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [hovered,   setHovered]   = useState<FGNode | null>(null);
  // Store ID rather than mutable node object to avoid stale-reference issues
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── search state ──────────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchOpen,    setSearchOpen]    = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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

  // Stable node lookup map — never mutated, rebuilt only on data change
  const nodeById = useMemo(
    () => new Map<string, FGNode>(graphData.nodes.map(n => [n.id as string, n as FGNode])),
    [graphData],
  );

  // Build neighbour map — deduplicate using a per-node id-keyed Map to prevent
  // duplicate entries when both A→B and B→A links exist for the same pair.
  const neighbourMap = useRef(new Map<string, FGNode[]>());
  useEffect(() => {
    const accum = new Map<string, Map<string, FGNode>>();
    for (const l of graphData.links) {
      const s = typeof l.source === 'object' ? (l.source as FGNode).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as FGNode).id : l.target;
      const sNode = nodeById.get(s as string);
      const tNode = nodeById.get(t as string);
      if (!sNode || !tNode) continue;
      const sid = s as string;
      const tid = t as string;
      if (!accum.has(sid)) accum.set(sid, new Map());
      if (!accum.has(tid)) accum.set(tid, new Map());
      accum.get(sid)!.set(tid, tNode);
      accum.get(tid)!.set(sid, sNode);
    }
    const m = new Map<string, FGNode[]>();
    for (const [id, nbrs] of accum) m.set(id, Array.from(nbrs.values()));
    neighbourMap.current = m;
  }, [graphData, nodeById]);

  // Derive selected node from stable ID
  const selectedNode = selectedId ? (nodeById.get(selectedId) ?? null) : null;

  // Hot set — ids of hovered/selected node + its neighbours (for link highlight)
  const hotIds = useRef(new Set<string>());
  useEffect(() => {
    if (!hovered && !selectedNode) { hotIds.current = new Set(); return; }
    const focus = selectedNode ?? hovered;
    if (!focus) return;
    const id = focus.id as string;
    hotIds.current = new Set([id, ...(neighbourMap.current.get(id) ?? []).map(n => n.id as string)]);
  }, [hovered, selectedNode]);

  // Configure forceCollide to prevent node overlap once graph data is ready
  useEffect(() => {
    if (graphData.nodes.length === 0) return;
    fgRef.current?.d3Force(
      'collide',
      forceCollide((node: NodeObject) => Math.sqrt((node as FGNode).val) * 5 + 8),
    );
  }, [graphData.nodes.length]);

  // ── search helpers ──────────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return graphData.nodes
      .filter(n => n.label.toLowerCase().includes(q))
      .slice(0, 10) as FGNode[];
  }, [searchQuery, graphData.nodes]);

  function selectAndFocus(node: FGNode) {
    setSelectedId(node.id as string);
    fgRef.current?.centerAt(node.x, node.y, 600);
    fgRef.current?.zoom(3.5, 600);
    setSearchQuery('');
    setSearchOpen(false);
  }

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── node paint ──────────────────────────────────────────────────────────────
  const nodeCanvasObject = useCallback((node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n   = node as FGNode;
    const r   = nodeRadius(n);
    const c   = NODE_COLOR[n.type] ?? '#f0a030';
    const id  = n.id as string;
    const hot = hotIds.current.has(id);
    const sel = selectedId === id;

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
  }, [selectedId]);

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
    const id = n.id as string;
    setSelectedId(prev => (prev === id ? null : id));
    fgRef.current?.centerAt(n.x, n.y, 600);
    fgRef.current?.zoom(3.5, 600);
  }

  function handleNodeHover(node: NodeObject | null) {
    setHovered(node ? node as FGNode : null);
  }

  function handleBackgroundClick() {
    setSelectedId(null);
  }

  function fitAll() {
    fgRef.current?.zoomToFit(400, 60);
  }

  // ── selected node with neighbours for info panel ────────────────────────────
  const selectedWithNeighbours = selectedNode
    ? { ...selectedNode, neighbors: neighbourMap.current.get(selectedNode.id as string) ?? [] }
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
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.4}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 60)}
          autoPauseRedraw={false}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      )}

      {/* Search — top-left */}
      {graphData.nodes.length > 0 && (
        <div ref={searchRef} className="absolute top-4 left-4 z-20" style={{ width: '220px' }}>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-dim pointer-events-none" />
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search nodes…"
              className="w-full bg-panel border border-rim rounded px-3 py-1.5 pl-7 pr-7 text-xs text-ink placeholder:text-ink-dim input-amber-focus"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink"
              >
                <X size={11} />
              </button>
            )}
          </div>
          {searchOpen && searchResults.length > 0 && (
            <div className="mt-1 bg-panel border border-rim rounded shadow-xl overflow-hidden">
              {searchResults.map(n => (
                <button
                  key={n.id}
                  onClick={() => selectAndFocus(n)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-card transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: NODE_COLOR[n.type], boxShadow: `0 0 4px ${NODE_COLOR[n.type]}` }}
                  />
                  <span className="text-xs text-ink truncate flex-1">{n.label}</span>
                  <span className="text-[10px] font-mono text-ink-dim shrink-0">{n.type[0]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fit-all button — top-right */}
      {graphData.nodes.length > 0 && (
        <button
          onClick={fitAll}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded bg-panel border border-rim text-ink-dim hover:text-ink hover:border-ink-dim transition-colors z-10"
          title="Fit all"
        >
          <RotateCcw size={13} />
        </button>
      )}

      {/* Legend — bottom-left */}
      {graphData.nodes.length > 0 && (
        <div className="absolute bottom-4 left-4 flex items-center gap-4 px-3 py-2 rounded bg-panel/80 border border-rim backdrop-blur-sm z-10">
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
          onClose={() => setSelectedId(null)}
          onSelectNeighbour={n => {
            const fn = n as FGNode;
            setSelectedId(fn.id as string);
            fgRef.current?.centerAt(fn.x, fn.y, 600);
            fgRef.current?.zoom(3.5, 600);
          }}
        />
      )}
    </div>
  );
}
