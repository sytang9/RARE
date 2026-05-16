import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getSettings, updateSettings } from '../settings/settings';
import { initAnthropic } from '../llm/anthropic';
import { initVault } from '../vault/templates';

export function SettingsView() {
  const [apiKey, setApiKey] = useState('');
  const [vaultPath, setVaultPath] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [monthly, setMonthly] = useState(0);

  useEffect(() => {
    getSettings().then(s => { setApiKey(s.anthropic_api_key); setVaultPath(s.vault_path); });
  }, []);

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      if (!settings.vault_path) return;
      try {
        const log = await invoke<string>('read_file_text', {
          path: `${settings.vault_path}/wiki/log.md`,
        });
        const ym = new Date().toISOString().slice(0, 7);
        const { sumLogCosts } = await import('../lib/cost');
        setMonthly(sumLogCosts(log, ym));
      } catch {
        // no log yet — silently ignore
      }
    })();
  }, []);

  async function save() {
    if (!vaultPath.trim()) {
      setSaveStatus('Vault path cannot be empty');
      return;
    }
    try {
      await updateSettings({ anthropic_api_key: apiKey, vault_path: vaultPath });
      if (apiKey) initAnthropic(apiKey);
      if (vaultPath.trim()) await initVault({ root: vaultPath });
      setSaveStatus('Saved');
    } catch (err) {
      setSaveStatus(`Error: ${err instanceof Error ? err.message : 'Save failed'}`);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <label className="block">
        <div className="text-sm text-zinc-400">Anthropic API key</div>
        <input
          className="w-full bg-zinc-900 p-2 rounded"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          type="password"
        />
      </label>
      <label className="block">
        <div className="text-sm text-zinc-400">Vault folder (absolute path)</div>
        <input
          className="w-full bg-zinc-900 p-2 rounded"
          value={vaultPath}
          onChange={e => setVaultPath(e.target.value)}
        />
      </label>
      <button onClick={save} className="px-4 py-2 bg-zinc-200 text-zinc-900 rounded">Save</button>
      {saveStatus && <p className="text-sm text-zinc-400">{saveStatus}</p>}
      <p className="text-sm text-zinc-400">This month: ${monthly.toFixed(2)}</p>
    </div>
  );
}
