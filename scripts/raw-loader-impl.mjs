// Hook implementation for ?raw imports — handles Vite's ?raw suffix in Node.js / tsx context.
// Runs in a worker thread via module.register().
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('?raw')) {
    const resolved = await nextResolve(specifier.slice(0, -4), context);
    // Mark the URL so the load hook can identify it
    return { ...resolved, url: resolved.url + '?raw' };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('?raw')) {
    // fileURLToPath uses url.pathname, ignoring the ?raw query suffix
    const filePath = fileURLToPath(url);
    const content = readFileSync(filePath, 'utf-8');
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(content)};`,
    };
  }
  return nextLoad(url, context);
}
