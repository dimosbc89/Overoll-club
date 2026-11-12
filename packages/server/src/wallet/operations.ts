/**
 * Wallet operations (API contract v0.7): links for the member app, the Apple
 * PassKit web service, and the job that sends pass updates.
 *
 * Nothing here moves points. Passes are read-only views of the member's card;
 * the pass QR is the static Wallet token the till already accepts.
 */
import * as input from '../internal/input.js';
import { type Db, type Failure, fail } from '../result.js';
import { type AppleSetup, appleAuthToken, appleDownloadToken, buildPkpass, parseDownloadToken, sameText } from './apple.js';
import type { WalletDesign } from './design.js';
import { type GoogleSetup, googleSaveUrl, googleUpdateObject } from './google.js';
import { type WalletPassData, loadWalletPass, memberIdForUser } from './pass-data.js';

export interface WalletServices {
  /** Pass designs by brand slug (built from the brand files). */
  designs: Readonly<Record<string, WalletDesign>>;
  /** Missing until the brand's Pass Type ID certificate is set up. */
  apple?: AppleSetup;
  /** Missing until the Google Wallet service account is set up. */
  google?: GoogleSetup;
  /**
   * Send the PassKit update push (an empty notification) to these devices.
   * Returns the tokens Apple reports as no longer valid.
   */
  pushApple?(pushTokens: readonly string[]): Promise<{ unregistered: string[] }>;
}

/** How long a .pkpass download link works. */
export const APPLE_DOWNLOAD_SECONDS = 10 * 60;

type LinkResult = { ok: true; url: string } | Failure<'invalid_input' | 'member_not_found' | 'not_configured'>;

async function callerPass(sql: Db, callerUserId: unknown, services: WalletServices) {
  const parsed = input.parseInput(() => input.uuid(callerUserId, 'callerUserId'));
  if ('failure' in parsed) return { error: parsed.failure } as const;
  const userId = parsed.input;
  const memberId = await memberIdForUser(sql, userId);
  const pass = memberId ? await loadWalletPass(sql, memberId) : null;
  if (!pass) return { error: fail('member_not_found') } as const;
  const design = services.designs[pass.brandSlug];
  if (!design) return { error: fail('not_configured', 'No Wallet design for this brand') } as const;
  return { pass, design, error: undefined } as const;
}

/** Member app: a short-lived link that downloads the member's Apple Wallet pass. */
export async function walletAppleLink(
  sql: Db,
  args: { callerUserId: unknown; now?: Date },
  services: WalletServices,
): Promise<LinkResult> {
  if (!services.apple) return fail('not_configured', 'Apple Wallet is not set up yet');
  const found = await callerPass(sql, args.callerUserId, services);
  if (found.error) return found.error;
  const now = input.now(args.now);
  const expiresAt = Math.floor(now.getTime() / 1000) + APPLE_DOWNLOAD_SECONDS;
  const token = await appleDownloadToken(found.pass, expiresAt);
  return { ok: true, url: `${services.apple.webServiceUrl}/download/${token}` };
}

/** Member app: the "Add to Google Wallet" link. Google objects of this member get updates from now on. */
export async function walletGoogleLink(
  sql: Db,
  args: { callerUserId: unknown; now?: Date },
  services: WalletServices,
): Promise<LinkResult> {
  if (!services.google) return fail('not_configured', 'Google Wallet is not set up yet');
  const found = await callerPass(sql, args.callerUserId, services);
  if (found.error) return found.error;
  const now = input.now(args.now);
  const url = await googleSaveUrl(found.pass, found.design, services.google, now);
  await sql`
    update public.member_secrets set google_wallet_at = coalesce(google_wallet_at, ${now})
    where member_id = ${found.pass.memberId}
  `;
  return { ok: true, url };
}

export type PassFile = { kind: 'pass'; pkpass: Uint8Array; lastModified: Date; fileName: string };

async function pkpassFor(pass: WalletPassData, services: WalletServices): Promise<PassFile | null> {
  const design = services.designs[pass.brandSlug];
  if (!design || !services.apple) return null;
  const pkpass = await buildPkpass(pass, design, services.apple);
  return { kind: 'pass', pkpass, lastModified: pass.changedAt, fileName: `${design.programName.replace(/[^\w-]+/g, '-')}.pkpass` };
}

/** GET …/wallet/apple/download/<token>: the .pkpass behind a link from walletAppleLink. */
export async function walletAppleDownload(
  sql: Db,
  token: string,
  services: WalletServices,
  now: Date = new Date(),
): Promise<PassFile | { kind: 'not_found' } | { kind: 'expired' }> {
  const parsed = parseDownloadToken(token);
  if (!parsed) return { kind: 'not_found' };
  const pass = await loadWalletPass(sql, parsed.memberId);
  if (!pass) return { kind: 'not_found' };
  const expected = (await appleDownloadToken(pass, parsed.expiresAt)).split('.')[2]!;
  if (!sameText(expected, parsed.sig)) return { kind: 'not_found' };
  if (parsed.expiresAt * 1000 < now.getTime()) return { kind: 'expired' };
  return (await pkpassFor(pass, services)) ?? { kind: 'not_found' };
}

/** The pass behind a PassKit web service call, if the pass type and the ApplePass token match. */
async function authorizedPass(
  sql: Db,
  services: WalletServices,
  passTypeId: string,
  serial: string,
  authToken: string | null,
): Promise<WalletPassData | null> {
  if (!services.apple || passTypeId !== services.apple.passTypeId || !authToken) return null;
  const pass = await loadWalletPass(sql, serial);
  if (!pass) return null;
  return sameText(await appleAuthToken(pass), authToken) ? pass : null;
}

/** POST /v1/devices/{device}/registrations/{passType}/{serial}: 201 new, 200 already registered, 401 refused. */
export async function registerAppleDevice(
  sql: Db,
  args: { deviceLibraryId: string; passTypeId: string; serial: string; pushToken: unknown; authToken: string | null },
  services: WalletServices,
): Promise<201 | 200 | 400 | 401> {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(args.deviceLibraryId)) return 400;
  if (typeof args.pushToken !== 'string' || !/^[A-Za-z0-9._-]{1,256}$/.test(args.pushToken)) return 400;
  const pass = await authorizedPass(sql, services, args.passTypeId, args.serial, args.authToken);
  if (!pass) return 401;
  const [row] = await sql<{ inserted: boolean }[]>`
    insert into public.wallet_apple_devices (device_library_id, member_id, brand_id, push_token)
    values (${args.deviceLibraryId}, ${pass.memberId}, ${pass.brandId}, ${args.pushToken})
    on conflict (device_library_id, member_id) do update set push_token = excluded.push_token
    returning (xmax = 0) as inserted
  `;
  return row?.inserted ? 201 : 200;
}

/** DELETE /v1/devices/{device}/registrations/{passType}/{serial}: 200, or 401 refused. */
export async function unregisterAppleDevice(
  sql: Db,
  args: { deviceLibraryId: string; passTypeId: string; serial: string; authToken: string | null },
  services: WalletServices,
): Promise<200 | 401> {
  const pass = await authorizedPass(sql, services, args.passTypeId, args.serial, args.authToken);
  if (!pass) return 401;
  await sql`
    delete from public.wallet_apple_devices where device_library_id = ${args.deviceLibraryId} and member_id = ${pass.memberId}
  `;
  return 200;
}

/**
 * GET /v1/devices/{device}/registrations/{passType}?passesUpdatedSince=…: the
 * device's passes that changed since the tag (null = 204, nothing changed).
 * The tag is a millisecond timestamp we hand out as `lastUpdated`.
 */
export async function appleSerialsUpdatedSince(
  sql: Db,
  args: { deviceLibraryId: string; passTypeId: string; since: string | null },
  services: WalletServices,
): Promise<{ serialNumbers: string[]; lastUpdated: string } | null> {
  if (!services.apple || args.passTypeId !== services.apple.passTypeId) return null;
  const since = args.since && /^\d{1,15}$/.test(args.since) ? new Date(Number(args.since)) : new Date(0);
  // Milliseconds on both sides: the tag is a JavaScript timestamp, the column has microseconds.
  const rows = await sql<{ member_id: string; changed: Date }[]>`
    select d.member_id, date_trunc('milliseconds', s.wallet_changed_at) as changed
    from public.wallet_apple_devices d
    join public.member_secrets s on s.member_id = d.member_id
    where d.device_library_id = ${args.deviceLibraryId} and date_trunc('milliseconds', s.wallet_changed_at) > ${since}
  `;
  if (!rows.length) return null;
  const last = Math.max(...rows.map((r) => new Date(r.changed).getTime()));
  return { serialNumbers: rows.map((r) => r.member_id), lastUpdated: String(last) };
}

/** GET /v1/passes/{passType}/{serial}: the latest pass, 304 when unchanged since If-Modified-Since, 401 refused. */
export async function applePassForDevice(
  sql: Db,
  args: { passTypeId: string; serial: string; authToken: string | null; ifModifiedSince: string | null },
  services: WalletServices,
): Promise<PassFile | { kind: 'not_modified' } | { kind: 'unauthorized' }> {
  const pass = await authorizedPass(sql, services, args.passTypeId, args.serial, args.authToken);
  if (!pass) return { kind: 'unauthorized' };
  const since = args.ifModifiedSince ? Date.parse(args.ifModifiedSince) : NaN;
  // HTTP dates have whole seconds.
  if (!Number.isNaN(since) && Math.floor(pass.changedAt.getTime() / 1000) * 1000 <= since) return { kind: 'not_modified' };
  return (await pkpassFor(pass, services)) ?? { kind: 'unauthorized' };
}

export interface WalletUpdatesResult {
  ok: true;
  /** Members whose pass change was sent. */
  members: number;
  applePushes: number;
  googleUpdates: number;
  /** Members left for the next run because sending failed. */
  failed: number;
}

/**
 * Job (every minute): for members whose pass changed since it was last sent,
 * push to their Apple devices (Wallet then fetches the new pass) and update
 * their Google object. Only members with a pass are looked at.
 */
export async function walletUpdates(
  sql: Db,
  services: WalletServices,
  options: { now?: Date; batchSize?: number } = {},
): Promise<WalletUpdatesResult> {
  const now = options.now ?? new Date();
  const batchSize = Math.min(Math.max(options.batchSize ?? 200, 1), 1000);
  const result: WalletUpdatesResult = { ok: true, members: 0, applePushes: 0, googleUpdates: 0, failed: 0 };
  // `changed` as text keeps the microseconds, so wallet_sent_at can be set to exactly what was sent.
  const rows = await sql<{ member_id: string; changed: string; google: boolean }[]>`
    select s.member_id, s.wallet_changed_at::text as changed, s.google_wallet_at is not null as google
    from public.member_secrets s
    where (s.google_wallet_at is not null or s.member_id in (select member_id from public.wallet_apple_devices))
      and (s.wallet_sent_at is null or s.wallet_sent_at < s.wallet_changed_at)
    order by s.wallet_changed_at
    limit ${batchSize}
  `;
  for (const row of rows) {
    try {
      const pass = await loadWalletPass(sql, row.member_id);
      if (pass) {
        const tokens = (
          await sql<{ push_token: string }[]>`select push_token from public.wallet_apple_devices where member_id = ${row.member_id}`
        ).map((r) => r.push_token);
        if (tokens.length && services.pushApple) {
          const { unregistered } = await services.pushApple(tokens);
          result.applePushes += tokens.length - unregistered.length;
          if (unregistered.length) {
            await sql`delete from public.wallet_apple_devices where member_id = ${row.member_id} and push_token in ${sql(unregistered)}`;
          }
        }
        const design = services.designs[pass.brandSlug];
        if (row.google && services.google && design) {
          if ((await googleUpdateObject(pass, design, services.google, now)) === 'updated') result.googleUpdates++;
        }
      }
      await sql`
        update public.member_secrets set wallet_sent_at = ${row.changed}::text::timestamptz
        where member_id = ${row.member_id} and (wallet_sent_at is null or wallet_sent_at < ${row.changed}::text::timestamptz)
      `;
      result.members++;
    } catch (error) {
      console.error('wallet update failed', row.member_id, error);
      result.failed++;
    }
  }
  return result;
}
