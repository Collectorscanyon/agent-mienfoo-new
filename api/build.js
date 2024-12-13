import { build } from 'esbuild';

async function bundle() {
  try {
    await build({
      entryPoints: ['api/index.ts', 'api/webhook.ts', 'api/health.ts'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outdir: 'dist',
      format: 'esm',
      external: ['@vercel/node'],
      minify: true,
      sourcemap: true
    });
    console.log('Build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

bundle();
