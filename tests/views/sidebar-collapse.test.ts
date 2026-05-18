import { describe, it, expect } from 'vitest';

// Pure logic: given sidebarOpen boolean, produce the correct CSS class string
function sidebarWidthClass(open: boolean): string {
  return open ? 'w-[260px]' : 'w-8';
}

describe('WikiView sidebar collapse', () => {
  it('returns wide class when open', () => {
    expect(sidebarWidthClass(true)).toBe('w-[260px]');
  });
  it('returns narrow class when closed', () => {
    expect(sidebarWidthClass(false)).toBe('w-8');
  });
});
