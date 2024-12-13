import { build } from 'esbuild';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function bundle() {
  try {
    const commonConfig = {
      bundle: true,
      platform: 'node',
      target: 'node20',
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
      outbase: 'api',
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    };

    const entryPoints = [
      'index.ts',
      'webhook.ts',
      'health.ts',
      'config.ts'
    ].map(file => resolve(__dirname, file));

    console.log('Building API functions with configuration:', {
      entryPoints,
      target: commonConfig.target,
      format: commonConfig.format
    });

    for (const entry of entryPoints) {
      const outfile = resolve(__dirname, 'dist', entry.replace(__dirname, '').replace('.ts', '.js'));
      
      console.log(`Building ${entry} -> ${outfile}`);
      
      await build({
        ...commonConfig,
        entryPoints: [entry],
        outfile,
        plugins: [
          {
            name: 'externalize-deps',
            setup(build) {
              build.onResolve({ filter: /^[^./]|^\.[^./]|^\.\.[^/]/ }, args => ({
                external: true
              }));
            },
          },
        ],
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
