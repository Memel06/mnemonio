import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as {
  version: string;
};
const define = { __VERSION__: JSON.stringify(pkg.version) };

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    define,
  },
  {
    entry: ['src/cli.ts', 'src/mcp.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
    splitting: false,
    treeshake: true,
    define,
  },
]);
