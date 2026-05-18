import { useState, useEffect, useRef } from 'react';
import { Inbox, MessageSquare, Settings, GitBranch, BookOpen, FolderOpen, ChevronDown, Plus, Trash2, Check } from 'lucide-react';
import { ChatView } from './views/ChatView';
import { PasteView } from './views/PasteView';
import { SettingsView } from './views/SettingsView';
import { GraphView } from './views/GraphView';
import { WikiView } from './views/WikiView';
import { SourcesView } from './views/SourcesView';
import { NewVaultModal } from './views/NewVaultModal';
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
    if (new URLSearchParams(window.location.search).has('wiki')) return 'wiki';
    return 'ingest';
  });

  const { vaults, activeVaultId, fetchVaults, switchVault, deleteVault } = useVaultStore();
  const [vaultDropdown, setVaultDropdown] = useState(false);
  const [showNewVault, setShowNewVault]   = useState(false);
  const [deletingId, setDeletingId]       = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

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

  const activeVault = vaults.find(v => v.id === activeVaultId);

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (vaults.length <= 1) return;
    if (!confirm('Delete this vault and all its data? This cannot be undone.')) return;
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
      <aside className="w-[220px] shrink-0 bg-panel border-r border-rim flex flex-col">

        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-rim gap-3">
          <span
            className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold text-black shrink-0"
            style={{
              background: 'var(--color-amber)',
              animation: 'logo-pulse 3s ease-in-out infinite',
            }}
          >
            R
          </span>
          <span className="font-semibold text-[15px] tracking-tight text-ink">RARE</span>
        </div>

        {/* Vault switcher */}
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
                  <button
                    key={v.id}
                    onClick={() => handleSwitch(v.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-card transition-colors group"
                  >
                    <Check
                      size={11}
                      className={v.id === activeVaultId ? 'text-amber shrink-0' : 'text-transparent shrink-0'}
                    />
                    <span className="flex-1 truncate text-xs text-ink">{v.name}</span>
                    {vaults.length > 1 && (
                      <button
                        onClick={(e) => handleDelete(v.id, e)}
                        disabled={deletingId === v.id}
                        className="opacity-0 group-hover:opacity-100 text-ink-dim hover:text-red-400 transition-all disabled:opacity-40"
                        aria-label="Delete vault"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </button>
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

        {/* Nav */}
        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={[
                  'w-full flex items-center gap-3 py-2.5 rounded text-sm font-medium transition-all duration-100',
                  'border-l-[3px]',
                  active
                    ? 'border-amber text-amber pl-[9px] pr-3'
                    : 'border-transparent text-ink-dim hover:text-ink hover:bg-card pl-[9px] pr-3',
                ].join(' ')}
                style={active ? { background: 'rgba(240, 160, 48, 0.08)' } : undefined}
              >
                <Icon size={15} strokeWidth={1.8} />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-rim">
          <p className="text-[11px] text-ink-dim font-mono tracking-wide">v1</p>
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
            // page reloads via switchVault inside createVault, but just in case:
            fetchVaults();
          }}
        />
      )}
    </div>
  );
}
