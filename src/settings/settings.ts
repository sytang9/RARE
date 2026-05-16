import { openDb } from '../db/connect';
import type Database from '@tauri-apps/plugin-sql';

interface SettingsShape {
  anthropic_api_key: string;
  vault_path: string;
  cost_ceiling_usd: number;
  lint_interval_hours: number;
}

const DEFAULTS: SettingsShape = {
  anthropic_api_key: '',
  vault_path: '',
  cost_ceiling_usd: 10,
  lint_interval_hours: 24,
};

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) db = await openDb('settings.sqlite');
  return db;
}

export async function getSettings(): Promise<SettingsShape> {
  const d = await getDb();
  const rows = await d.select<{ key: string; value: string }[]>('SELECT key, value FROM settings');
  const out = { ...DEFAULTS };
  for (const r of rows) {
    if (r.key === 'cost_ceiling_usd' || r.key === 'lint_interval_hours') {
      (out as Record<string, unknown>)[r.key] = Number(r.value);
    } else {
      (out as Record<string, unknown>)[r.key] = r.value;
    }
  }
  return out;
}

export async function updateSettings(patch: Partial<SettingsShape>): Promise<void> {
  const d = await getDb();
  for (const [k, v] of Object.entries(patch)) {
    await d.execute(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [k, String(v)],
    );
  }
}
