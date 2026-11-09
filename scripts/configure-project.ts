/**
 * Supabase settings kept as code (supabase/project.config.json):
 * Auth site URL and redirect URLs, the one-time sign-in code (length, expiry, email
 * template with texts from docs/copy-deck.md), custom SMTP via Resend once it is
 * switched on, the Edge Function's ALLOWED_ORIGINS, and the scheduled jobs (supabase/jobs.sql).
 *
 *   npm run project:check   validates everything offline (part of `npm test`)
 *   npm run project:apply   applies it with the Management API; needs SUPABASE_ACCESS_TOKEN
 *                           (and RESEND_API_KEY when email.enabled is true). Runs in CI on main.
 *   ... -- --print          also prints the rendered email (check mode)
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

interface ProjectConfig {
  projectRef: string;
  programName: string;
  supportEmail: string;
  siteUrl: string;
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
    throw new Error(`supabase/project.config.json: ${msg}`);
  };
  if (!/^[a-z]{20}$/.test(cfg.projectRef)) fail('projectRef looks wrong');
  if (!cfg.siteUrl.startsWith('https://')) fail('siteUrl must be https');
  for (const u of cfg.redirectUrls) {
    if (!/^(https:\/\/|overollclub:\/\/|http:\/\/localhost:\d+\/)/.test(u)) fail(`redirect URL not allowed: ${u}`);
  }
  for (const o of cfg.allowedOrigins) {
    if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/localhost:\d+)$/.test(o)) fail(`origin must be scheme://host[:port] only: ${o}`);
  }
  const { minutes, length } = cfg.signInCode;
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) fail('signInCode.minutes must be 5–60');
  if (!Number.isInteger(length) || length < 6 || length > 10) fail('signInCode.length must be 6–10');
  if (!/^[^@\s]+@[^@\s]+$/.test(cfg.email.senderEmail)) fail('email.senderEmail');
  if (!Number.isInteger(cfg.email.maxPerHour) || cfg.email.maxPerHour < 30) fail('email.maxPerHour must be ≥ 30');

  const subjectRow = copy['email.code.subject'];
  if (!subjectRow) throw new Error('docs/copy-deck.md: email.code.subject missing');
  const subject = fillPlaceholders(subjectRow.el, cfg);
  const html = renderTemplate(template, copy, cfg);
  if (!subject.includes(TOKEN) || !html.includes(TOKEN)) throw new Error('the sign-in email must show the code');
  const jobsSql = jobs.replaceAll('{projectRef}', cfg.projectRef);
  if (/\{[a-zA-Z]+\}/.test(jobsSql.replace(/\{\}/g, ''))) throw new Error('supabase/jobs.sql: unknown placeholder');
  if (!/cron\.schedule\('overoll-expire-redemptions'/.test(jobsSql) || !/cron\.schedule\('overoll-expire-points'/.test(jobsSql)) {
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
  const changed = Object.entries(desired.secrets).filter(([name, value]) => {
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

async function scheduleJobs(token: string, ref: string, jobsSql: string) {
  await api(token, 'POST', `/projects/${ref}/database/query`, { query: jobsSql });
  const rows = (await api(token, 'POST', `/projects/${ref}/database/query`, {
    query: "select jobname, schedule, active from cron.job where jobname like 'overoll-%' order by jobname",
  })) as { jobname: string; schedule: string; active: boolean }[];
  console.log(`jobs: ${rows.map((r) => `${r.jobname} (${r.schedule}${r.active ? '' : ', inactive'})`).join(', ')}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const cfg = JSON.parse(read('supabase/project.config.json')) as ProjectConfig;
  const desired = buildDesired(
    cfg,
    readCopyDeck(read('docs/copy-deck.md')),
    read('supabase/templates/sign-in-code.html'),
    read('supabase/jobs.sql'),
  );
  if (args.has('--apply')) {
    await apply(cfg, desired);
    await scheduleJobs(process.env.SUPABASE_ACCESS_TOKEN!, cfg.projectRef, desired.jobsSql);
    return;
  }
  if (args.has('--print')) console.log(`Subject: ${desired.subject}\n\n${desired.html}`);
  console.log(
    `project config OK: site ${cfg.siteUrl}, ${cfg.redirectUrls.length} redirect URLs, ` +
      `${cfg.signInCode.length}-digit code for ${cfg.signInCode.minutes} min, SMTP ${cfg.email.enabled ? 'on' : 'off'}`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
