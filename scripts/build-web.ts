/**
 * Builds a web app for one brand for Cloudflare Pages, which runs this from the repo root
 * on every push to main: `npm run build:web:mobile -- --brand koala` (default: overoll).
 *
 * The apps get their public settings from supabase/projects/<brand>.json: the brand, the
 * Supabase URL (from projectRef), the publishable key and the site URL. Nothing is typed
 * into Cloudflare and no secret is involved: the publishable key ships in every client and
 * row-level security decides what it can read. A secret key is refused.
 *
 *   mobile → apps/mobile/dist   (Expo web, static HTML per route)
 *   admin  → apps/admin/out     (Next.js static export: back office + till console)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject, root } from './projects.js';

interface PublicConfig {
  projectRef: string;
  publishableKey: string;
  siteUrl: string;
}

export function publicSettings(cfg: PublicConfig) {
  if (!/^[a-z]{20}$/.test(cfg.projectRef)) throw new Error('projectRef looks wrong');
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(cfg.publishableKey)) {
    throw new Error('publishableKey must be a Supabase publishable key (sb_publishable_…), never a secret key');
  }
  if (!cfg.siteUrl.startsWith('https://')) throw new Error('siteUrl must be https');
  return { supabaseUrl: `https://${cfg.projectRef}.supabase.co`, publishableKey: cfg.publishableKey, siteUrl: cfg.siteUrl };
}

function run(cwd: string, cmd: string, args: string[], env: Record<string, string>) {
  console.log(`> (${cwd.replace(root + '/', '')}) ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function brandArg(argv: string[]): string {
  const i = argv.indexOf('--brand');
  if (i >= 0) return argv[i + 1] ?? '';
  const eq = argv.find((a) => a.startsWith('--brand='));
  return eq ? eq.slice('--brand='.length) : (process.env.BRAND ?? 'overoll');
}

function main() {
  const app = process.argv[2];
  const brand = brandArg(process.argv.slice(3));
  const cfg = loadProject(brand);
  const s = publicSettings(cfg);
  console.log(`brand: ${brand} (${cfg.programName})`);

  if (app === 'mobile') {
    const dir = join(root, 'apps/mobile');
    run(dir, 'npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'], {
      EXPO_PUBLIC_BRAND: brand,
      EXPO_PUBLIC_SUPABASE_URL: s.supabaseUrl,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: s.publishableKey,
      EXPO_PUBLIC_CLUB_URL: s.siteUrl,
    });
    if (!existsSync(join(dir, 'dist/index.html'))) throw new Error('apps/mobile/dist/index.html missing');
    console.log('web app built: apps/mobile/dist');
  } else if (app === 'admin') {
    const dir = join(root, 'apps/admin');
    run(dir, 'npx', ['next', 'build', '--webpack'], {
      NEXT_PUBLIC_BRAND: brand,
      NEXT_PUBLIC_SUPABASE_URL: s.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: s.publishableKey,
      NEXT_PUBLIC_CLUB_URL: s.siteUrl,
      STATIC_EXPORT: '1',
    });
    if (!existsSync(join(dir, 'out/index.html'))) throw new Error('apps/admin/out/index.html missing');
    console.log('back office built: apps/admin/out');
  } else {
    console.error('usage: tsx scripts/build-web.ts mobile|admin [--brand <slug>]');
    process.exit(2);
  }
}

main();
