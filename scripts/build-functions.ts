/**
 * Bundles each Supabase Edge Function's app module into one plain ESM file:
 *   supabase/functions/<name>/app.ts  →  supabase/functions/<name>/dist/app.js
 * Workspace packages (@grow-loyalty/*) and pure-JS dependencies are bundled. The
 * npm libraries that need the Deno runtime (`postgres`, `@supabase/supabase-js`)
 * are only type imports in app.ts: the entry file imports them as npm:
 * specifiers and hands them to `start()`. The build fails if any import is left
 * in the output, so the bundle runs from anywhere (local entry or a URL).
 *
 *   npm run functions:build
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Plugin, build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const functions = ['api'];

const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(join(root, path), 'utf8'));

/**
 * `virtual:wallet-designs`: every brand's Wallet pass design, from the brand's
 * files (packages/server WalletDesign): supabase/projects/<brand>.json,
 * data/<brand>/wallet.json and wallet/*.png, data/copy/wallet.<locale>.json and
 * the app's tier names (shared copy with the brand's overrides). Plus Apple's
 * public WWDR certificate. Shared code never names a brand; the bundle carries
 * them all and the function picks its own by the brand slug in its database.
 */
function walletDesignsModule(): string {
  const tiers = ['classic', 'gold', 'club'] as const;
  const locales = ['el', 'en'] as const;
  const appCopy = Object.fromEntries(locales.map((l) => [l, readJson(`apps/mobile/src/i18n/${l}.json`)]));
  const copy = Object.fromEntries(locales.map((l) => [l, readJson(`data/copy/wallet.${l}.json`)]));
  const designs: Record<string, unknown> = {};
  for (const file of readdirSync(join(root, 'supabase/projects')).filter((f) => f.endsWith('.json')).sort()) {
    const project = readJson(`supabase/projects/${file}`) as { brand: string; programName: string; siteUrl: string; supportEmail: string };
    const slug = project.brand;
    if (!existsSync(join(root, `data/${slug}/wallet.json`))) continue;
    const wallet = readJson(`data/${slug}/wallet.json`) as { colors: unknown };
    const brandCopy = Object.fromEntries(
      locales.map((l) => {
        const path = `apps/mobile/src/brand/${slug}.${l}.json`;
        return [l, existsSync(join(root, path)) ? readJson(path) : {}];
      }),
    );
    const tierNames = Object.fromEntries(
      tiers.map((t) => [
        t,
        Object.fromEntries(locales.map((l) => [l, String(brandCopy[l]![`tiers.${t}.name`] ?? appCopy[l]![`tiers.${t}.name`])])),
      ]),
    );
    const imageDir = join(root, `data/${slug}/wallet`);
    const images = Object.fromEntries(
      readdirSync(imageDir)
        .filter((f) => f.endsWith('.png'))
        .sort()
        .map((f) => [f, readFileSync(join(imageDir, f)).toString('base64')]),
    );
    const siteUrl = project.siteUrl.replace(/\/+$/, '');
    designs[slug] = {
      slug,
      programName: project.programName,
      siteUrl,
      supportEmail: project.supportEmail,
      colors: wallet.colors,
      tiers: tierNames,
      copy,
      appleImagesBase64: images,
      googleLogoUrl: `${siteUrl}/wallet/logo.png`,
    };
  }
  const wwdr = readFileSync(join(root, 'data/wallet/apple-wwdr-g4.pem'), 'utf8');
  return `export const walletDesigns = ${JSON.stringify(designs)};\nexport const appleWwdrPem = ${JSON.stringify(wwdr)};\n`;
}

const walletDesignsPlugin: Plugin = {
  name: 'wallet-designs',
  setup(b) {
    b.onResolve({ filter: /^virtual:wallet-designs$/ }, () => ({ path: 'wallet-designs', namespace: 'wallet-designs' }));
    b.onLoad({ filter: /.*/, namespace: 'wallet-designs' }, () => ({ contents: walletDesignsModule(), loader: 'js' }));
  },
};

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
    plugins: [walletDesignsPlugin],
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
