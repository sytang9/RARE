import { create } from 'zustand';

export interface VaultInfo {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  isActive: boolean;
}

interface VaultState {
  vaults: VaultInfo[];
  activeVaultId: number | null;
  loading: boolean;
  fetchVaults(): Promise<void>;
  switchVault(id: number): Promise<void>;
  createVault(name: string, slug: string): Promise<VaultInfo>;
  deleteVault(id: number): Promise<void>;
  generatePurpose(vaultId: number, description: string, questions: string): Promise<string>;
  skipOnboarding(vaultId: number): Promise<void>;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vaults: [],
  activeVaultId: null,
  loading: false,

  async fetchVaults() {
    set({ loading: true });
    try {
      const r = await fetch('/api/vaults');
      const data = await r.json() as { vaults: VaultInfo[]; activeVaultId: number | null };
      set({ vaults: data.vaults, activeVaultId: data.activeVaultId, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async switchVault(id) {
    const r = await fetch(`/api/vaults/${id}/activate`, { method: 'PATCH' });
    if (!r.ok) throw new Error('Switch failed');
    set({ activeVaultId: id });
    // Force full page reload so all views re-fetch data for the new vault
    window.location.reload();
  },

  async createVault(name, slug) {
    const r = await fetch('/api/vaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug }),
    });
    if (!r.ok) {
      const err = await r.json() as { error: string };
      throw new Error(err.error ?? 'Create failed');
    }
    const vault = await r.json() as VaultInfo;
    set(s => ({ vaults: [...s.vaults, vault], activeVaultId: vault.id }));
    return vault;
  },

  async deleteVault(id) {
    const r = await fetch(`/api/vaults/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Delete failed');
    const { vaults, activeVaultId } = get();
    const remaining = vaults.filter(v => v.id !== id);
    // If deleted the active vault, switch to the first remaining
    if (activeVaultId === id && remaining.length > 0) {
      await get().switchVault(remaining[0].id);
    } else {
      set({ vaults: remaining });
    }
  },

  async generatePurpose(vaultId, description, questions) {
    const r = await fetch(`/api/vaults/${vaultId}/generate-purpose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, questions }),
    });
    if (!r.ok) {
      const err = await r.json() as { error: string };
      throw new Error(err.error ?? 'Generate failed');
    }
    const data = await r.json() as { purpose: string };
    return data.purpose;
  },

  async skipOnboarding(vaultId) {
    await fetch(`/api/vaults/${vaultId}/activate`, { method: 'PATCH' });
    await get().fetchVaults();
  },
}));
