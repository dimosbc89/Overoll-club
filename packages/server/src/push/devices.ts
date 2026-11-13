import { isPushToken } from '@grow-loyalty/core';
import * as input from '../internal/input.js';
import { InputError } from '../internal/input.js';
import { type Db, type Result, fail } from '../result.js';

export interface RegisterPushDeviceInput {
  callerUserId: string;
  /** The Expo push token of this phone (`ExponentPushToken[…]`). */
  token: string;
  platform: 'ios' | 'android';
}

export type RegisterPushDeviceResult = Result<{ registered: true }, 'invalid_input' | 'member_not_found'>;

function parseToken(value: unknown): string {
  if (!isPushToken(value)) throw new InputError('token must be an Expo push token');
  return value;
}

/**
 * push/register (v0.9): the member app sends its Expo push token after the
 * phone allowed notifications. One phone belongs to one member at a time:
 * the token moves to whoever registered it last (another account signed in
 * on the same phone). Safe to repeat.
 */
export async function registerPushDevice(sql: Db, raw: RegisterPushDeviceInput): Promise<RegisterPushDeviceResult> {
  const parsed = input.parseInput(() => {
    if (raw.platform !== 'ios' && raw.platform !== 'android') throw new InputError('platform must be ios or android');
    return { callerUserId: input.uuid(raw.callerUserId, 'callerUserId'), token: parseToken(raw.token), platform: raw.platform };
  });
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;
  const [member] = await sql<{ id: string; brand_id: string }[]>`
    select id, brand_id from public.members where user_id = ${i.callerUserId} and deleted_at is null
    order by created_at limit 1
  `;
  if (!member) return fail('member_not_found');
  await sql`
    insert into public.push_devices (brand_id, member_id, token, platform)
    values (${member.brand_id}, ${member.id}, ${i.token}, ${i.platform})
    on conflict (brand_id, token) do update set member_id = excluded.member_id, platform = excluded.platform, updated_at = now()
  `;
  return { ok: true, registered: true };
}

export interface UnregisterPushDeviceInput {
  callerUserId: string;
  token: string;
}

export type UnregisterPushDeviceResult = Result<{ removed: number }, 'invalid_input'>;

/** push/unregister (v0.9): on sign-out the phone stops getting this member's messages. */
export async function unregisterPushDevice(sql: Db, raw: UnregisterPushDeviceInput): Promise<UnregisterPushDeviceResult> {
  const parsed = input.parseInput(() => ({
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    token: parseToken(raw.token),
  }));
  if ('failure' in parsed) return parsed.failure;
  const { callerUserId, token } = parsed.input;
  const rows = await sql`
    delete from public.push_devices d
    using public.members m
    where d.token = ${token} and d.member_id = m.id and m.user_id = ${callerUserId}
    returning d.id
  `;
  return { ok: true, removed: rows.length };
}
