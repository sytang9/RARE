import { useState } from 'react';
import { Inbox, MessageSquare, Settings, GitBranch, BookOpen, FolderOpen } from 'lucide-react';
import { ChatView } from './views/ChatView';
import { PasteView } from './views/PasteView';
import { SettingsView } from './views/SettingsView';
import { GraphView } from './views/GraphView';
import { WikiView } from './views/WikiView';
import { SourcesView } from './views/SourcesView';

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
  const [tab, setTab] = useState<Tab>('ingest');

  return (
    <div className="h-screen flex bg-base text-ink overflow-hidden">
      <aside className="w-[220px] shrink-0 bg-panel border-r border-rim flex flex-col">
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
        {/* key={tab} remounts the wrapper on every tab change, triggering view-in */}
        <div key={tab} className="view-in h-full">
          {tab === 'ingest'  && <PasteView />}
          {tab === 'chat'    && <ChatView />}
          {tab === 'sources' && <SourcesView />}
          {tab === 'wiki'    && <WikiView />}
          {tab === 'graph'   && <GraphView />}
          {tab === 'settings'&& <SettingsView />}
        </div>
      </main>
    </div>
  );
}
