import { build } from 'esbuild';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      outbase: 'api',
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    };

    // Get all TypeScript files in the api directory
    const entryPoints = readdirSync(__dirname)
      .filter(file => file.endsWith('.ts'))
      .map(file => resolve(__dirname, file));

    console.log('Building Vercel serverless functions:', {
      entryPoints: entryPoints.map(ep => ep.replace(__dirname, '')),
      target: commonConfig.target,
      format: commonConfig.format
    });

    for (const entry of entryPoints) {
      const filename = entry.split('/').pop();
      const outfile = resolve(__dirname, '.vercel/output/functions', filename!.replace('.ts', '.func'));
      
      console.log(`Building ${filename} -> ${outfile}`);
      
      await build({
        ...commonConfig,
        entryPoints: [entry],
        outfile,
        plugins: [
          {
            name: 'externalize-deps',
            setup(build) {
              // Externalize all non-relative imports
              build.onResolve({ filter: /^[^./]|^\.[^./]|^\.\.[^/]/ }, args => ({
                external: true
              }));
            },
          },
        ],
      });

      // Create Vercel function configuration
      const config = {
        runtime: 'edge',
        entrypoint: filename!.replace('.ts', '.func'),
        memory: 1024,
        maxDuration: 60
      };

      // Write function configuration
      const configPath = resolve(__dirname, '.vercel/output/functions', filename!.replace('.ts', '.func.json'));
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
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
