/// <reference types="vite/client" />

// d3-force-3d has no @types package; declare it to keep strict mode happy.
declare module 'd3-force-3d' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceCollide(radius?: number | ((node: any) => number)): any;
}
