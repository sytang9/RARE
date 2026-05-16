import { useEffect, useState } from 'react';

interface SettingsData {
  vault_path: string;
  cost_ceiling_usd: number;
  lint_interval_hours: number;
  monthly_cost_usd: number;
}

export function SettingsView() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [costCeiling, setCostCeiling] = useState('');
  const [lintHours, setLintHours] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((s: SettingsData) => {
        setSettings(s);
        setCostCeiling(String(s.cost_ceiling_usd));
        setLintHours(String(s.lint_interval_hours));
      })
      .catch(() => setStatus('Failed to load settings'));
  }, []);

  async function save() {
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost_ceiling_usd: Number(costCeiling),
          lint_interval_hours: Number(lintHours),
        }),
      });
      if (!r.ok) throw new Error('Save failed');
      setStatus('Saved');
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : 'Save failed'}`);
    }
  }

  async function triggerLint() {
    setStatus('Running lint...');
    try {
      const r = await fetch('/api/lint', { method: 'POST' });
      if (!r.ok) throw new Error('Lint failed');
      setStatus('Lint complete');
    } catch (err) {
      setStatus(`Lint error: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  if (!settings) {
    return <div className="p-4 text-zinc-400">{status || 'Loading...'}</div>;
  }

  return (
    <div className="p-4 space-y-3">
      <div className="text-sm text-zinc-400">Vault: {settings.vault_path}</div>
      <label className="block">
        <div className="text-sm text-zinc-400">Cost ceiling (USD/month)</div>
        <input
          className="w-full bg-zinc-900 p-2 rounded"
          value={costCeiling}
          onChange={e => setCostCeiling(e.target.value)}
          type="number"
        />
      </label>
      <label className="block">
        <div className="text-sm text-zinc-400">Lint interval (hours)</div>
        <input
          className="w-full bg-zinc-900 p-2 rounded"
          value={lintHours}
          onChange={e => setLintHours(e.target.value)}
          type="number"
        />
      </label>
      <div className="flex gap-2">
        <button onClick={save} className="px-4 py-2 bg-zinc-200 text-zinc-900 rounded">Save</button>
        <button onClick={triggerLint} className="px-4 py-2 bg-zinc-700 text-zinc-100 rounded">Run lint</button>
      </div>
      {status && <p className="text-sm text-zinc-400">{status}</p>}
      <p className="text-sm text-zinc-400">This month: ${settings.monthly_cost_usd.toFixed(2)}</p>
    </div>
  );
}
