/**
 * Bundles each Supabase Edge Function's app module into one plain ESM file:
 *   supabase/functions/<name>/app.ts  →  supabase/functions/<name>/dist/app.js
 * Workspace packages (@overoll/*) and pure-JS dependencies are bundled. The
 * npm libraries that need the Deno runtime (`postgres`, `@supabase/supabase-js`)
 * are only type imports in app.ts: the entry file imports them as npm:
 * specifiers and hands them to `start()`. The build fails if any import is left
 * in the output, so the bundle runs from anywhere (local entry or a URL).
 *
 *   npm run functions:build
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const functions = ['api'];

async function main(): Promise<void> {
  for (const name of functions) {
  const outfile = join(root, 'supabase/functions', name, 'dist/app.js');
  const result = await build({
    entryPoints: [join(root, 'supabase/functions', name, 'app.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
    minify: true,
    legalComments: 'none',
    metafile: true,
    banner: { js: `// Built by scripts/build-functions.ts. Do not edit; edit supabase/functions/${name}/app.ts.` },
  });
  const output = Object.values(result.metafile.outputs)[0];
  const leftover = output?.imports.filter((i) => !i.path.startsWith('data:')) ?? [];
  if (leftover.length) throw new Error(`${name}: bundle still imports ${leftover.map((i) => i.path).join(', ')}`);
  const hash = createHash('sha256').update(readFileSync(outfile)).digest('hex').slice(0, 12);
  console.log(`${name}: ${outfile.replace(root + '/', '')} (${((output?.bytes ?? 0) / 1024).toFixed(1)} KB, sha256 ${hash})`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
