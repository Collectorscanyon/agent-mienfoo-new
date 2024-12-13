import { build } from 'esbuild';

async function bundle() {
  try {
    const commonConfig = {
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'esm',
      external: [
        '@vercel/node',
        '@neynar/nodejs-sdk',
        'openai',
        'zod'
      ],
      minify: true,
      sourcemap: true,
      logLevel: 'info',
      metafile: true,
    };

    const entryPoints = [
      'api/index.ts',
      'api/webhook.ts',
      'api/health.ts'
    ];

    for (const entry of entryPoints) {
      await build({
        ...commonConfig,
        entryPoints: [entry],
        outfile: `dist/${entry.replace('.ts', '.js')}`,
      });
    }

    console.log('Build completed successfully');
  } catch (error) {
    console.error('Build failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

bundle().catch(err => {
  console.error('Fatal build error:', err);
  process.exit(1);
});
