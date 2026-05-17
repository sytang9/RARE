import { useEffect, useState } from 'react';
import { FolderOpen, DollarSign, Clock, Play, Save } from 'lucide-react';

interface SettingsData {
  vault_path: string;
  cost_ceiling_usd: number;
  lint_interval_hours: number;
  monthly_cost_usd: number;
}

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-rim rounded-lg overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-rim">
        <Icon size={14} className="text-ink-dim" />
        <span className="text-xs font-mono text-ink-dim uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export function SettingsView() {
  const [settings, setSettings]       = useState<SettingsData | null>(null);
  const [costCeiling, setCostCeiling] = useState('');
  const [lintHours, setLintHours]     = useState('');
  const [status, setStatus]           = useState('');
  const [linting, setLinting]         = useState(false);

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
    setStatus('');
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost_ceiling_usd:    Number(costCeiling),
          lint_interval_hours: Number(lintHours),
        }),
      });
      if (!r.ok) throw new Error('Save failed');
      const updated = await r.json() as SettingsData;
      setSettings(updated);
      setStatus('Saved');
      setTimeout(() => setStatus(''), 2000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function runLint() {
    setLinting(true);
    setStatus('');
    try {
      const r = await fetch('/api/lint', { method: 'POST' });
      if (!r.ok) throw new Error('Lint failed');
      setStatus('Lint complete');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Lint failed');
    } finally {
      setLinting(false);
    }
  }

  if (!settings) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-ink-dim">{status || 'Loading…'}</p>
      </div>
    );
  }

  const spendPct  = Math.min(100, (settings.monthly_cost_usd / settings.cost_ceiling_usd) * 100);
  const overBudget = spendPct > 80;

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-xl space-y-4">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-ink mb-1">Settings</h1>
          <p className="text-sm text-ink-dim">Configure vault, cost limits, and lint schedule.</p>
        </div>

        <Section icon={FolderOpen} title="Vault">
          <p className="text-sm text-ink-dim mb-1">Path</p>
          <p className="text-sm font-mono text-ink bg-base px-3 py-2 rounded border border-rim break-all">
            {settings.vault_path}
          </p>
        </Section>

        <Section icon={DollarSign} title="Cost">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-sm text-ink-dim">This month</span>
            <span className="text-sm font-mono">
              <span className="text-amber">${settings.monthly_cost_usd.toFixed(2)}</span>
              <span className="text-ink-dim"> / ${Number(costCeiling).toFixed(2)}</span>
            </span>
          </div>
          <div className="h-1.5 bg-base rounded-full overflow-hidden mb-4">
            <div
              className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : 'bg-amber'}`}
              style={{
                width: `${spendPct}%`,
                boxShadow: overBudget
                  ? '0 0 10px rgba(239,68,68,0.6)'
                  : '0 0 10px rgba(240,160,48,0.55)',
              }}
            />
          </div>
          <label className="block">
            <p className="text-xs text-ink-dim mb-1.5">Monthly ceiling (USD)</p>
            <input
              type="number"
              value={costCeiling}
              onChange={e => setCostCeiling(e.target.value)}
              className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink font-mono input-amber-focus"
            />
          </label>
        </Section>

        <Section icon={Clock} title="Lint">
          <label className="block mb-4">
            <p className="text-xs text-ink-dim mb-1.5">Run interval (hours)</p>
            <input
              type="number"
              value={lintHours}
              onChange={e => setLintHours(e.target.value)}
              className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink font-mono input-amber-focus"
            />
          </label>
          <button
            onClick={runLint}
            disabled={linting}
            className="flex items-center gap-2 px-3 py-2 rounded border border-rim text-sm text-ink-dim hover:text-ink hover:border-ink-dim transition-colors disabled:opacity-50"
          >
            <Play size={13} />
            {linting ? 'Running…' : 'Run lint now'}
          </button>
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium text-black transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'var(--color-amber)' }}
          >
            <Save size={13} />
            Save
          </button>
          {status && (
            <span className={`text-xs ${status === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
