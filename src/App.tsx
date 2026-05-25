import { useState, useEffect, useRef } from 'react';
import { Inbox, MessageSquare, Settings, GitBranch, BookOpen, FolderOpen, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2, Check, Pencil } from 'lucide-react';
import { ChatView } from './views/ChatView';
import { PasteView } from './views/PasteView';
import { SettingsView } from './views/SettingsView';
import { GraphView } from './views/GraphView';
import { WikiView } from './views/WikiView';
import { SourcesView } from './views/SourcesView';
import { NewVaultModal } from './views/NewVaultModal';
import { ConfirmDialog } from './views/ConfirmDialog';
import { useVaultStore } from './state/vaultStore';

type Tab = 'ingest' | 'chat' | 'sources' | 'wiki' | 'graph' | 'settings';

const NAV: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'ingest',  label: 'Ingest',  icon: Inbox },
  { id: 'chat',    label: 'Chat',    icon: MessageSquare },
  { id: 'sources', label: 'Sources', icon: FolderOpen },
  { id: 'wiki',    label: 'Wiki',    icon: BookOpen },
  { id: 'graph',   label: 'Graph',   icon: GitBranch },
  { id: 'settings',label: 'Settings',icon: Settings },
];

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('wiki')) return 'wiki';
    const t = params.get('tab');
    if (t && (['ingest', 'chat', 'sources', 'wiki', 'graph', 'settings'] as string[]).includes(t)) return t as Tab;
    return 'ingest';
  });

  const { vaults, activeVaultId, fetchVaults, switchVault, deleteVault, renameVault } = useVaultStore();
  const [vaultDropdown, setVaultDropdown]   = useState(false);
  const [showNewVault, setShowNewVault]     = useState(false);
  const [deletingId, setDeletingId]         = useState<number | null>(null);
  const [confirmVaultId, setConfirmVaultId] = useState<number | null>(null);
  const [navOpen, setNavOpen]               = useState(true);
  const [editingVaultId, setEditingVaultId] = useState<number | null>(null);
  const [editingName, setEditingName]       = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

  // Keep URL in sync with the active tab so refresh restores the correct view.
  // Wiki tab keeps ?wiki=<page> when a page is already in the URL (opened via
  // wikilink in a new tab); otherwise it uses ?tab=wiki.
  useEffect(() => {
    const currentWikiParam = new URLSearchParams(window.location.search).get('wiki');
    if (tab === 'ingest') {
      window.history.replaceState(null, '', '/');
    } else if (tab === 'wiki' && currentWikiParam) {
      // A specific page is loaded — keep the ?wiki=<page> URL as-is.
    } else {
      window.history.replaceState(null, '', `/?tab=${tab}`);
    }
  }, [tab]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setVaultDropdown(false);
      }
    }
    if (vaultDropdown) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [vaultDropdown]);

  // Close vault dropdown when sidebar collapses
  useEffect(() => {
    if (!navOpen) setVaultDropdown(false);
  }, [navOpen]);

  const activeVault = vaults.find(v => v.id === activeVaultId);

  function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (vaults.length <= 1) return;
    setConfirmVaultId(id);
  }

  function handleEditStart(id: number, currentName: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingVaultId(id);
    setEditingName(currentName);
    // Focus the input on next paint
    setTimeout(() => editInputRef.current?.select(), 0);
  }

  async function handleEditCommit(id: number) {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== vaults.find(v => v.id === id)?.name) {
      await renameVault(id, trimmed);
    }
    setEditingVaultId(null);
  }

  function handleEditKeyDown(e: React.KeyboardEvent, id: number) {
    if (e.key === 'Enter') { e.preventDefault(); handleEditCommit(id); }
    if (e.key === 'Escape') { setEditingVaultId(null); }
  }

  async function doDeleteVault(id: number) {
    setConfirmVaultId(null);
    setDeletingId(id);
    try {
      await deleteVault(id);
    } finally {
      setDeletingId(null);
      setVaultDropdown(false);
    }
  }

  async function handleSwitch(id: number) {
    if (id === activeVaultId) { setVaultDropdown(false); return; }
    setVaultDropdown(false);
    await switchVault(id);
  }

  return (
    <div className="h-screen flex bg-base text-ink overflow-hidden">
      <aside className={`${navOpen ? 'w-[220px]' : 'w-12'} shrink-0 bg-panel border-r border-rim flex flex-col transition-all duration-200`}>

        {/* Logo */}
        <div className="h-14 flex items-center px-3 border-b border-rim gap-3 shrink-0">
          <span
            className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold text-black shrink-0"
            style={{
              background: 'var(--color-amber)',
              animation: 'logo-pulse 3s ease-in-out infinite',
            }}
          >
            R
          </span>
          {navOpen && <span className="font-semibold text-[15px] tracking-tight text-ink">RARE</span>}
        </div>

        {/* Vault switcher — hidden when collapsed */}
        {navOpen && (
          <div ref={dropdownRef} className="relative px-3 pt-3 pb-1">
            <button
              onClick={() => setVaultDropdown(v => !v)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded border border-rim bg-base hover:border-ink-dim transition-colors text-left"
            >
              <span className="flex-1 truncate text-xs font-medium text-ink">
                {activeVault?.name ?? 'Loading…'}
              </span>
              <ChevronDown
                size={12}
                className={`text-ink-dim shrink-0 transition-transform ${vaultDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {vaultDropdown && (
              <div className="absolute left-3 right-3 top-[calc(100%-4px)] z-40 bg-panel border border-rim rounded-lg shadow-xl overflow-hidden">
                <div className="py-1 max-h-52 overflow-y-auto">
                  {vaults.map(v => (
                    <div
                      key={v.id}
                      onClick={() => editingVaultId !== v.id && handleSwitch(v.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-card transition-colors group cursor-pointer"
                    >
                      <Check
                        size={11}
                        className={v.id === activeVaultId ? 'text-amber shrink-0' : 'text-transparent shrink-0'}
                      />
                      {editingVaultId === v.id ? (
                        <input
                          ref={editInputRef}
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onBlur={() => handleEditCommit(v.id)}
                          onKeyDown={e => handleEditKeyDown(e, v.id)}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 min-w-0 text-xs text-ink bg-base border border-amber rounded px-1 py-0.5 outline-none"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 truncate text-xs text-ink">{v.name}</span>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={e => handleEditStart(v.id, v.name, e)}
                          className="text-ink-dim hover:text-amber transition-colors"
                          aria-label="Rename vault"
                        >
                          <Pencil size={11} />
                        </button>
                        {vaults.length > 1 && (
                          <button
                            onClick={(e) => handleDelete(v.id, e)}
                            disabled={deletingId === v.id}
                            className="text-ink-dim hover:text-red-400 transition-all disabled:opacity-40"
                            aria-label="Delete vault"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-rim">
                  <button
                    onClick={() => { setVaultDropdown(false); setShowNewVault(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-ink-dim hover:text-ink hover:bg-card transition-colors"
                  >
                    <Plus size={12} />
                    New vault
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-3 px-1.5 space-y-0.5 overflow-hidden">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                title={!navOpen ? label : undefined}
                className={[
                  'w-full flex items-center rounded text-sm font-medium transition-all duration-100',
                  navOpen ? 'gap-3 py-2.5 border-l-[3px] pl-[9px] pr-3' : 'gap-0 py-2.5 justify-center border-l-[3px] pl-[5px]',
                  active
                    ? 'border-amber text-amber'
                    : 'border-transparent text-ink-dim hover:text-ink hover:bg-card',
                ].join(' ')}
                style={active ? { background: 'rgba(240, 160, 48, 0.08)' } : undefined}
              >
                <Icon size={15} strokeWidth={1.8} className="shrink-0" />
                {navOpen && label}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-rim flex items-center justify-between">
          {navOpen && <p className="text-[11px] text-ink-dim font-mono tracking-wide">v1</p>}
          <button
            onClick={() => setNavOpen(v => !v)}
            className={`${navOpen ? '' : 'mx-auto'} w-6 h-6 flex items-center justify-center rounded text-ink-dim hover:text-ink hover:bg-card transition-colors`}
            title={navOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {navOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden dot-grid">
        <div key={tab} className="view-in h-full">
          {tab === 'ingest'  && <PasteView />}
          {tab === 'chat'    && <ChatView />}
          {tab === 'sources' && <SourcesView />}
          {tab === 'wiki'    && <WikiView />}
          {tab === 'graph'   && <GraphView />}
          {tab === 'settings'&& <SettingsView />}
        </div>
      </main>

      {showNewVault && (
        <NewVaultModal
          onClose={() => setShowNewVault(false)}
          onCreated={() => {
            setShowNewVault(false);
            fetchVaults();
          }}
        />
      )}

      {confirmVaultId !== null && (() => {
        const v = vaults.find(x => x.id === confirmVaultId);
        return (
          <ConfirmDialog
            title="Delete vault?"
            body={`This will permanently delete "${v?.name ?? 'this vault'}" and all its wiki pages. This cannot be undone.`}
            onConfirm={() => doDeleteVault(confirmVaultId)}
            onCancel={() => setConfirmVaultId(null)}
          />
        );
      })()}
    </div>
  );
}
