/**
 * Supabase settings kept as code, one file per brand (supabase/projects/<brand>.json):
 * Auth site URL and redirect URLs, the one-time sign-in code (length, expiry, email
 * template with texts from docs/copy-deck.md), custom SMTP via Resend once it is
 * switched on, the Edge Function's ALLOWED_ORIGINS, and the scheduled jobs (supabase/jobs.sql).
 *
 *   npm run project:check   validates every project offline (part of `npm test`)
 *   npm run project:apply   applies them with the Management API; needs SUPABASE_ACCESS_TOKEN
 *                           (and RESEND_API_KEY when email.enabled is true). Runs in CI on main.
 *   ... -- --project koala  only that brand (repeatable)
 *   ... -- --print          also prints the rendered email (check mode)
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ProjectConfig, root, selectedProjects } from './projects.js';

const read = (path: string) => readFileSync(join(root, path), 'utf8');

type Copy = Record<string, { el: string; en: string }>;

/** Rows of the copy deck: | `key` | Ελληνικά | English | ... */
export function readCopyDeck(markdown: string): Copy {
  const copy: Copy = {};
  for (const line of markdown.split('\n')) {
    const m = /^\|\s*`([a-z0-9_.]+)`[^|]*\|([^|]*)\|([^|]*)\|/i.exec(line);
    if (m) copy[m[1]!] = { el: m[2]!.trim(), en: m[3]!.trim() };
  }
  return copy;
}

const TOKEN = '{{ .Token }}';

export function renderTemplate(template: string, copy: Copy, cfg: ProjectConfig): string {
  let html = template.replace(/<!--[\s\S]*?-->\n?/g, '');
  html = html.replace(/\[\[([a-z0-9_.]+)\|(el|en)\]\]/gi, (_, key: string, lang: 'el' | 'en') => {
    const row = copy[key];
    if (!row) throw new Error(`template: copy key "${key}" not found in docs/copy-deck.md`);
    return escapeHtml(row[lang]);
  });
  return fillPlaceholders(html, cfg);
}

function fillPlaceholders(text: string, cfg: ProjectConfig): string {
  const values: Record<string, string> = {
    programName: cfg.programName,
    brandName: cfg.brandName,
    emailLogoUrl: cfg.emailLogoUrl,
    minutes: String(cfg.signInCode.minutes),
    supportEmail: cfg.supportEmail,
    code: TOKEN,
  };
  const out = text.replace(/(?<!\{)\{([a-zA-Z]+)\}(?!\})/g, (whole, name: string) => values[name] ?? whole);
  const left = /(?<!\{)\{[a-zA-Z]+\}(?!\})/.exec(out);
  if (left) throw new Error(`unknown placeholder ${left[0]}`);
  if (/\[\[/.test(out)) throw new Error('unresolved [[copy]] marker');
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildDesired(cfg: ProjectConfig, copy: Copy, template: string, jobs: string) {
  const fail = (msg: string) => {
    throw new Error(`supabase/projects/${cfg.brand}.json: ${msg}`);
  };
  if (!/^[a-z]{20}$/.test(cfg.projectRef)) fail('projectRef looks wrong');
  if (!cfg.siteUrl.startsWith('https://')) fail('siteUrl must be https');
  if (!/^https:\/\/[^\s"<>]+$/.test(cfg.emailLogoUrl)) fail('emailLogoUrl must be an https URL');
  if (!cfg.brandName?.trim() || !cfg.programName?.trim()) fail('brandName and programName are required');
  if (!/^[a-z][a-z0-9]{2,30}$/.test(cfg.appScheme)) fail('appScheme must be lowercase letters and digits');
  for (const u of cfg.redirectUrls) {
    const ok = u.startsWith('https://') || u.startsWith(`${cfg.appScheme}://`) || /^http:\/\/localhost:\d+\//.test(u);
    if (!ok) fail(`redirect URL not allowed: ${u}`);
  }
  if (!cfg.redirectUrls.some((u) => u.startsWith(cfg.siteUrl))) fail('redirectUrls must include the siteUrl');
  for (const o of cfg.allowedOrigins) {
    if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/localhost:\d+)$/.test(o)) fail(`origin must be scheme://host[:port] only: ${o}`);
  }
  const { minutes, length } = cfg.signInCode;
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) fail('signInCode.minutes must be 5–60');
  if (!Number.isInteger(length) || length < 6 || length > 10) fail('signInCode.length must be 6–10');
  if (!/^[^@\s]+@[^@\s]+$/.test(cfg.email.senderEmail)) fail('email.senderEmail');
  if (cfg.email.enabled && /\.example$/i.test(cfg.email.senderEmail)) fail('email.enabled needs a real sender domain');
  if (!Number.isInteger(cfg.email.maxPerHour) || cfg.email.maxPerHour < 30) fail('email.maxPerHour must be ≥ 30');

  const subjectRow = copy['email.code.subject'];
  if (!subjectRow) throw new Error('docs/copy-deck.md: email.code.subject missing');
  const subject = fillPlaceholders(subjectRow.el, cfg);
  const html = renderTemplate(template, copy, cfg);
  if (!subject.includes(TOKEN) || !html.includes(TOKEN)) throw new Error('the sign-in email must show the code');
  const jobsSql = jobs.replaceAll('{projectRef}', cfg.projectRef);
  if (/\{[a-zA-Z]+\}/.test(jobsSql.replace(/\{\}/g, ''))) throw new Error('supabase/jobs.sql: unknown placeholder');
  if (!/cron\.schedule\('club-expire-redemptions'/.test(jobsSql) || !/cron\.schedule\('club-expire-points'/.test(jobsSql)) {
    throw new Error('supabase/jobs.sql must schedule both jobs');
  }

  const auth: Record<string, string | number | boolean> = {
    site_url: cfg.siteUrl,
    uri_allow_list: cfg.redirectUrls.join(','),
    external_email_enabled: true,
    disable_signup: false, // signInWithOtp({ shouldCreateUser: true }) creates members
    mailer_otp_exp: minutes * 60,
    mailer_otp_length: length,
    mailer_subjects_magic_link: subject,
    mailer_templates_magic_link_content: html,
    mailer_subjects_confirmation: subject,
    mailer_templates_confirmation_content: html,
  };
  if (cfg.email.enabled) {
    Object.assign(auth, {
      smtp_admin_email: cfg.email.senderEmail,
      smtp_sender_name: cfg.email.senderName,
      smtp_host: cfg.email.smtpHost,
      smtp_port: String(cfg.email.smtpPort),
      smtp_user: cfg.email.smtpUser,
      rate_limit_email_sent: cfg.email.maxPerHour,
    });
  }
  const secrets = { ALLOWED_ORIGINS: cfg.allowedOrigins.join(',') };
  return { auth, secrets, subject, html, jobsSql };
}

async function api(token: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function apply(cfg: ProjectConfig, desired: ReturnType<typeof buildDesired>) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
  const ref = cfg.projectRef;

  const current = (await api(token, 'GET', `/projects/${ref}/config/auth`)) as Record<string, unknown>;
  const unknown = Object.keys(desired.auth).filter((k) => !(k in current));
  if (unknown.length) throw new Error(`the Management API has no auth settings named: ${unknown.join(', ')}`);

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(desired.auth)) {
    if (String(current[k] ?? '') !== String(v)) patch[k] = v;
  }
  if (cfg.email.enabled) {
    const pass = process.env.RESEND_API_KEY;
    if (!pass) throw new Error('email.enabled is true but RESEND_API_KEY is not set');
    // The API never returns the password, so it is sent whenever SMTP settings change or SMTP is new.
    if (Object.keys(patch).some((k) => k.startsWith('smtp_')) || !current.smtp_host) patch.smtp_pass = pass;
  }
  // Supabase refuses template changes on the free plan with its built-in sender, so the
  // templates go in a second request; the rest applies either way.
  const isTemplate = (k: string) => k.startsWith('mailer_subjects_') || k.startsWith('mailer_templates_');
  const base = Object.fromEntries(Object.entries(patch).filter(([k]) => !isTemplate(k)));
  const templates = Object.fromEntries(Object.entries(patch).filter(([k]) => isTemplate(k)));
  if (Object.keys(base).length) {
    await api(token, 'PATCH', `/projects/${ref}/config/auth`, base);
    console.log(`auth: updated ${Object.keys(base).join(', ')}`);
  }
  if (Object.keys(templates).length) {
    try {
      await api(token, 'PATCH', `/projects/${ref}/config/auth`, templates);
      console.log('auth: sign-in email template updated');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/free tier|upgrade your plan|custom SMTP/i.test(msg)) throw err;
      console.log(
        '::warning::Sign-in email template not applied: Supabase needs the Pro plan or custom SMTP ' +
          '(switch on email.enabled once Resend is verified). Until then emails use the default template.',
      );
    }
  }
  if (!Object.keys(patch).length) console.log('auth: already up to date');

  const existing = (await api(token, 'GET', `/projects/${ref}/secrets`)) as { name: string; value: string }[];
  const secrets: Record<string, string> = { ...desired.secrets, ...walletSecrets(cfg) };
  const changed = Object.entries(secrets).filter(([name, value]) => {
    const now = existing.find((s) => s.name === name)?.value;
    return now !== value && now !== createHash('sha256').update(value).digest('hex');
  });
  if (changed.length) {
    await api(token, 'POST', `/projects/${ref}/secrets`, changed.map(([name, value]) => ({ name, value })));
    console.log(`function secrets: updated ${changed.map(([n]) => n).join(', ')}`);
  } else {
    console.log('function secrets: already up to date');
  }
}

/**
 * Wallet passes (API contract v0.7): the Edge Function reads these. CI passes the
 * brand's GitHub secrets as env (APPLE_PASS_P12, APPLE_PASS_P12_PASSWORD,
 * GOOGLE_WALLET_SERVICE_ACCOUNT); the Google issuer id comes from the project
 * file. Each is set only when present, so a brand without Wallet keeps working.
 */
function walletSecrets(cfg: ProjectConfig): Record<string, string> {
  const out: Record<string, string> = {};
  const p12 = process.env.APPLE_PASS_P12?.replace(/\s+/g, '');
  if (p12) {
    out.APPLE_PASS_P12 = p12;
    out.APPLE_PASS_P12_PASSWORD = process.env.APPLE_PASS_P12_PASSWORD ?? '';
  }
  const account = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT?.trim();
  if (account && cfg.wallet?.googleIssuerId) {
    const parsed = JSON.parse(account) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) throw new Error('GOOGLE_WALLET_SERVICE_ACCOUNT is not a service account JSON key');
    out.GOOGLE_WALLET_SERVICE_ACCOUNT = JSON.stringify(parsed);
    out.GOOGLE_WALLET_ISSUER_ID = cfg.wallet.googleIssuerId;
  }
  return out;
}

/**
 * A new project gets its brand, stores and rewards from supabase/seed/<brand>.sql once:
 * only when the brand row does not exist yet, so later edits from the back office are
 * never overwritten by a deploy.
 */
async function seedIfNew(token: string, cfg: ProjectConfig) {
  if (!/^[a-z0-9-]+$/.test(cfg.brand)) throw new Error(`bad brand slug ${cfg.brand}`);
  const rows = (await api(token, 'POST', `/projects/${cfg.projectRef}/database/query`, {
    query: `select count(*)::int as n from public.brands where slug = '${cfg.brand}'`,
  })) as { n: number }[];
  if (rows[0]?.n) {
    console.log(`seed: brand ${cfg.brand} already exists, left as it is`);
    return;
  }
  await api(token, 'POST', `/projects/${cfg.projectRef}/database/query`, { query: read(`supabase/seed/${cfg.brand}.sql`) });
  console.log(`seed: brand ${cfg.brand} created from supabase/seed/${cfg.brand}.sql`);
}

async function scheduleJobs(token: string, ref: string, jobsSql: string) {
  await api(token, 'POST', `/projects/${ref}/database/query`, { query: jobsSql });
  const rows = (await api(token, 'POST', `/projects/${ref}/database/query`, {
    query: "select jobname, schedule, active from cron.job where jobname like 'club-%' order by jobname",
  })) as { jobname: string; schedule: string; active: boolean }[];
  console.log(`jobs: ${rows.map((r) => `${r.jobname} (${r.schedule}${r.active ? '' : ', inactive'})`).join(', ')}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const copy = readCopyDeck(read('docs/copy-deck.md'));
  const template = read('supabase/templates/sign-in-code.html');
  const jobs = read('supabase/jobs.sql');
  for (const cfg of selectedProjects()) {
    const desired = buildDesired(cfg, copy, template, jobs);
    if (args.has('--apply')) {
      console.log(`== ${cfg.brand} (${cfg.projectRef})`);
      await apply(cfg, desired);
      await seedIfNew(process.env.SUPABASE_ACCESS_TOKEN!, cfg);
      await scheduleJobs(process.env.SUPABASE_ACCESS_TOKEN!, cfg.projectRef, desired.jobsSql);
      continue;
    }
    if (args.has('--print')) console.log(`Subject: ${desired.subject}\n\n${desired.html}`);
    console.log(
      `${cfg.brand}: project config OK: site ${cfg.siteUrl}, ${cfg.redirectUrls.length} redirect URLs, ` +
        `${cfg.signInCode.length}-digit code for ${cfg.signInCode.minutes} min, SMTP ${cfg.email.enabled ? 'on' : 'off'}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
