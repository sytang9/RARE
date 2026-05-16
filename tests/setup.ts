import { afterEach, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn().mockResolvedValue({ execute: vi.fn(), select: vi.fn(), close: vi.fn() }) },
}));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));
