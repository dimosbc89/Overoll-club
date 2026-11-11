/**
 * The hosted Supabase projects, one per brand: supabase/projects/<brand>.json.
 *
 * Every brand has its own project (its own database, auth and functions), all built
 * from the same migrations, functions and core rules in this repo. The file name is
 * the brand slug (`brands.slug` in that project's database).
 *
 * Scripts that act on projects take `--project <brand>` (repeatable); without it they
 * act on every project.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase/projects');

export interface ProjectConfig {
  /** Brand slug: the file name, `brands.slug`, data/<brand>/ and supabase/seed/<brand>.sql. */
  brand: string;
  projectRef: string;
  publishableKey: string;
  /** "Overoll Club", fills {programName}. */
  programName: string;
  /** Short brand name for copy: "Overoll", "Koala" (fills {brandName}). */
  brandName: string;
  supportEmail: string;
  siteUrl: string;
  /** Public https URL of the square logo shown in the sign-in email. */
  emailLogoUrl: string;
  /** Deep-link scheme of the native app, e.g. "overollclub" (redirect URLs may use it). */
  appScheme: string;
  redirectUrls: string[];
  allowedOrigins: string[];
  signInCode: { minutes: number; length: number };
  email: {
    enabled: boolean;
    senderName: string;
    senderEmail: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    maxPerHour: number;
  };
}

export function projectSlugs(): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function loadProject(slug: string): ProjectConfig {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`bad brand slug: ${slug}`);
  const cfg = JSON.parse(readFileSync(join(dir, `${slug}.json`), 'utf8')) as ProjectConfig;
  if (cfg.brand !== slug) throw new Error(`supabase/projects/${slug}.json: "brand" must be "${slug}"`);
  if (!/^[a-z]{20}$/.test(cfg.projectRef)) throw new Error(`supabase/projects/${slug}.json: projectRef looks wrong`);
  return cfg;
}

/** The projects named by `--project <brand>` arguments, or all of them. */
export function selectedProjects(argv: string[] = process.argv.slice(2)): ProjectConfig[] {
  const named: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') {
      const v = argv[i + 1];
      if (!v) throw new Error('--project needs a brand slug');
      named.push(v);
      i++;
    } else if (argv[i]!.startsWith('--project=')) {
      named.push(argv[i]!.slice('--project='.length));
    }
  }
  const all = projectSlugs();
  for (const n of named) if (!all.includes(n)) throw new Error(`no supabase/projects/${n}.json (have: ${all.join(', ')})`);
  const refs = new Map<string, string>();
  const configs = (named.length ? named : all).map(loadProject);
  for (const c of configs) {
    const other = refs.get(c.projectRef);
    if (other) throw new Error(`brands ${other} and ${c.brand} point at the same Supabase project`);
    refs.set(c.projectRef, c.brand);
  }
  return configs;
}
