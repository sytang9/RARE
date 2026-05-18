// Entry point — loaded with --import to register the ?raw ESM hooks.
// The actual hook implementation runs in a worker thread (raw-loader-impl.mjs).
import { register } from 'node:module';
register('./raw-loader-impl.mjs', import.meta.url);
