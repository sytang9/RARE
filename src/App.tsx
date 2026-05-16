import { useState, useEffect } from 'react';
import { ChatView } from './views/ChatView';
import { PasteView } from './views/PasteView';
import { SettingsView } from './views/SettingsView';
import { maybeRunLint } from './lint/scheduler';
import { getSettings } from './settings/settings';

const TABS = ['Chat', 'Ingest', 'Settings'] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Ingest');

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      if (!s.vault_path) return;
      await maybeRunLint({ root: s.vault_path }, s.lint_interval_hours);
    })();
  }, []);
  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <nav className="flex border-b border-zinc-800">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 ${tab === t ? 'bg-zinc-800' : ''}`}
          >{t}</button>
        ))}
      </nav>
      <div className="flex-1 overflow-hidden">
        {tab === 'Chat' && <ChatView />}
        {tab === 'Ingest' && <PasteView />}
        {tab === 'Settings' && <SettingsView />}
      </div>
    </div>
  );
}
