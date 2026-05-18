export function pathJoin(...parts: string[]): string {
  return parts
    .join('/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '') || '/';
}

export function pathDirname(p: string): string {
  const idx = p.lastIndexOf('/');
  if (idx <= 0) return '/';
  return p.slice(0, idx);
}

export function pathBasename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}
