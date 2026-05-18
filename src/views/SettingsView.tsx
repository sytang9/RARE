import { useEffect, useState } from 'react';
import { FolderOpen, DollarSign, Clock, Play, Save, Link } from 'lucide-react';

interface SettingsData {
  vault_path: string;
  cost_ceiling_usd: number;
  lint_interval_hours: number;
  monthly_cost_usd: number;
  confluence_base_url: string;
  confluence_email: string;
  confluence_api_token: string;
}

interface CostBreakdown {
  total: number;
  byType: { ingest: number; chat: number; lint: number };
  byDay: Array<{ date: string; ingest: number; chat: number; lint: number }>;
}

type Period = 'today' | 'month' | 'all';

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

function fmt(n: number): string {
  return n > 0 ? `$${n.toFixed(3)}` : '—';
}

export function SettingsView() {
  const [settings, setSettings]           = useState<SettingsData | null>(null);
  const [costCeiling, setCostCeiling]     = useState('');
  const [lintHours, setLintHours]         = useState('');
  const [confBaseUrl, setConfBaseUrl]     = useState('');
  const [confEmail, setConfEmail]         = useState('');
  const [confToken, setConfToken]         = useState('');
  const [status, setStatus]               = useState('');
  const [linting, setLinting]             = useState(false);
  const [period, setPeriod]               = useState<Period>('month');
  const [costs, setCosts]                 = useState<CostBreakdown | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((s: SettingsData) => {
        setSettings(s);
        setCostCeiling(String(s.cost_ceiling_usd));
        setLintHours(String(s.lint_interval_hours));
        setConfBaseUrl(s.confluence_base_url ?? '');
        setConfEmail(s.confluence_email ?? '');
        setConfToken(s.confluence_api_token ?? '');
      })
      .catch(() => setStatus('Failed to load settings'));
  }, []);

  useEffect(() => {
    fetch(`/api/costs?period=${period}`)
      .then(r => r.json())
      .then((c: CostBreakdown) => setCosts(c))
      .catch(() => { /* ignore */ });
  }, [period]);

  async function save() {
    setStatus('');
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost_ceiling_usd:      Number(costCeiling),
          lint_interval_hours:   Number(lintHours),
          confluence_base_url:   confBaseUrl,
          confluence_email:      confEmail,
          confluence_api_token:  confToken,
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

  const total = costs?.total ?? 0;
  const byType = costs?.byType ?? { ingest: 0, chat: 0, lint: 0 };
  const byDay  = costs?.byDay  ?? [];
  const barTotal = byType.ingest + byType.chat + byType.lint;

  const PERIOD_LABELS: Record<Period, string> = { today: 'Today', month: 'This month', all: 'All time' };

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

        {/* Cost breakdown section */}
        <Section icon={DollarSign} title="Cost">

          {/* Period toggle */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-ink-dim">Period:</span>
            <div className="flex bg-base border border-rim rounded overflow-hidden">
              {(['today', 'month', 'all'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={[
                    'px-3 py-1 text-[11px] font-mono transition-colors',
                    period === p
                      ? 'bg-amber text-black font-bold'
                      : 'text-ink-dim hover:text-ink',
                  ].join(' ')}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Total + stacked bar */}
          <div className="bg-base border border-rim rounded-lg p-3 mb-3">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-xs text-ink-dim">{PERIOD_LABELS[period]}</span>
              <span className="text-[15px] font-mono font-bold text-ink">${total.toFixed(3)}</span>
            </div>

            {barTotal > 0 ? (
              <>
                {/* Stacked proportional bar */}
                <div className="h-2 rounded-full overflow-hidden flex gap-px mb-2">
                  {byType.ingest > 0 && (
                    <div
                      className="h-full rounded-l-full"
                      style={{ width: `${(byType.ingest / barTotal) * 100}%`, background: '#34d399' }}
                    />
                  )}
                  {byType.chat > 0 && (
                    <div
                      className="h-full"
                      style={{ width: `${(byType.chat / barTotal) * 100}%`, background: '#38bdf8' }}
                    />
                  )}
                  {byType.lint > 0 && (
                    <div
                      className="h-full rounded-r-full"
                      style={{ width: `${(byType.lint / barTotal) * 100}%`, background: '#f0a030' }}
                    />
                  )}
                </div>
                {/* Legend */}
                <div className="flex gap-4 flex-wrap">
                  {[
                    { label: 'Ingest', color: '#34d399', val: byType.ingest },
                    { label: 'Chat',   color: '#38bdf8', val: byType.chat   },
                    { label: 'Lint',   color: '#f0a030', val: byType.lint   },
                  ].map(({ label, color, val }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
                      <span className="text-[10px] font-mono text-ink-dim">
                        {label} {fmt(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-dim">No costs recorded for this period.</p>
            )}
          </div>

          {/* Daily table */}
          {byDay.length > 0 && (
            <div className="bg-base border border-rim rounded-lg overflow-hidden">
              {/* Header */}
              <div className="flex justify-between px-3 py-1.5 border-b border-rim">
                <span className="text-[10px] font-mono text-ink-dim/60 uppercase tracking-widest">Date</span>
                <div className="flex gap-4">
                  <span className="text-[10px] font-mono uppercase tracking-widest w-14 text-right" style={{ color: '#34d39970' }}>Ingest</span>
                  <span className="text-[10px] font-mono uppercase tracking-widest w-12 text-right" style={{ color: '#38bdf870' }}>Chat</span>
                  <span className="text-[10px] font-mono uppercase tracking-widest w-10 text-right" style={{ color: '#f0a03070' }}>Lint</span>
                </div>
              </div>
              {byDay.map(day => (
                <div key={day.date} className="flex justify-between px-3 py-2 border-b border-rim/40 last:border-0">
                  <span className="text-[11px] font-mono text-ink-dim">{day.date}</span>
                  <div className="flex gap-4">
                    <span className="text-[11px] font-mono w-14 text-right" style={{ color: day.ingest > 0 ? '#34d399' : undefined }}>
                      {day.ingest > 0 ? fmt(day.ingest) : <span className="text-ink-dim/40">—</span>}
                    </span>
                    <span className="text-[11px] font-mono w-12 text-right" style={{ color: day.chat > 0 ? '#38bdf8' : undefined }}>
                      {day.chat > 0 ? fmt(day.chat) : <span className="text-ink-dim/40">—</span>}
                    </span>
                    <span className="text-[11px] font-mono w-10 text-right" style={{ color: day.lint > 0 ? '#f0a030' : undefined }}>
                      {day.lint > 0 ? fmt(day.lint) : <span className="text-ink-dim/40">—</span>}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ceiling config */}
          <div className="mt-4">
            <label className="block">
              <p className="text-xs text-ink-dim mb-1.5">Monthly ceiling (USD)</p>
              <input
                type="number"
                value={costCeiling}
                onChange={e => setCostCeiling(e.target.value)}
                className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink font-mono input-amber-focus"
              />
            </label>
          </div>
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

        <Section icon={Link} title="Confluence">
          <p className="text-xs text-ink-dim mb-4">
            Paste a Confluence page URL in Ingest and RARE will fetch it automatically using these credentials.
          </p>
          <div className="space-y-3">
            <label className="block">
              <p className="text-xs text-ink-dim mb-1.5">Base URL</p>
              <input
                type="text"
                value={confBaseUrl}
                onChange={e => setConfBaseUrl(e.target.value)}
                placeholder="https://yourorg.atlassian.net"
                className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink font-mono placeholder:text-ink-dim/40 input-amber-focus"
              />
            </label>
            <label className="block">
              <p className="text-xs text-ink-dim mb-1.5">Email</p>
              <input
                type="email"
                value={confEmail}
                onChange={e => setConfEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink font-mono placeholder:text-ink-dim/40 input-amber-focus"
              />
            </label>
            <label className="block">
              <p className="text-xs text-ink-dim mb-1.5">API token <span className="text-ink-dim/50 font-sans">(stored locally, never sent anywhere else)</span></p>
              <input
                type="password"
                value={confToken}
                onChange={e => setConfToken(e.target.value)}
                placeholder="Your Atlassian API token"
                className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink font-mono placeholder:text-ink-dim/40 input-amber-focus"
              />
            </label>
          </div>
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
