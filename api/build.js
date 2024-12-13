import { build } from 'esbuild';

build({
  entryPoints: ['index.ts', 'webhook.ts', 'health.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outdir: 'dist',
  format: 'esm',
  external: ['@vercel/node']
}).catch(() => process.exit(1));
