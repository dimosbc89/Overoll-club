import { createRotatingToken, createWalletToken, defaultConfig } from '@overoll/core';
import { joinMember } from '../../src/index.js';
import type { Sql } from './db.js';

/** Fixed ids, in the style of supabase/tests/rls.sql. */
export const ids = {
  brand: '10000000-0000-0000-0000-000000000001',
  otherBrand: '10000000-0000-0000-0000-000000000002',
  storeA: '20000000-0000-0000-0000-00000000000a',
  storeB: '20000000-0000-0000-0000-00000000000b',
  closedStore: '20000000-0000-0000-0000-00000000000c',
  otherStore: '20000000-0000-0000-0000-00000000000f',
  hq: '00000000-0000-0000-0000-0000000000b1',
  deviceA: '00000000-0000-0000-0000-0000000000c1',
  deviceB: '00000000-0000-0000-0000-0000000000c2',
  deviceClosed: '00000000-0000-0000-0000-0000000000c3',
  otherBrandDevice: '00000000-0000-0000-0000-0000000000c9',
  managerA: '00000000-0000-0000-0000-0000000000d1',
  platform: '00000000-0000-0000-0000-0000000000e1',
  nobody: '00000000-0000-0000-0000-0000000000f1',
  maria: '30000000-0000-0000-0000-00000000000a', // store A, PIN 1234
  nikos: '30000000-0000-0000-0000-00000000000b', // store B, PIN 5678
  retiredA: '30000000-0000-0000-0000-0000000000a2', // store A, inactive, PIN 1111
  closedEmployee: '30000000-0000-0000-0000-00000000000c', // closed store, PIN 2222
  otherEmployee: '30000000-0000-0000-0000-00000000000f', // other brand, PIN 0000
  espresso: '50000000-0000-0000-0000-000000000001', // base 300
  croissant: '50000000-0000-0000-0000-000000000002', // base 500
  goldOnly: '50000000-0000-0000-0000-000000000003', // base 400, Gold and above
  retiredReward: '50000000-0000-0000-0000-000000000004', // inactive
  otherReward: '50000000-0000-0000-0000-00000000000f', // other brand
} as const;

export const pins = { maria: '1234', nikos: '5678', retiredA: '1111', closedEmployee: '2222', otherEmployee: '0000' };

export async function seedWorld(admin: Sql): Promise<void> {
  await admin`
    insert into auth.users (id) values
      (${ids.hq}), (${ids.deviceA}), (${ids.deviceB}), (${ids.deviceClosed}), (${ids.otherBrandDevice}),
      (${ids.managerA}), (${ids.platform}), (${ids.nobody})
  `;
  await admin`
    insert into public.brands (id, slug, name) values
      (${ids.brand}, 'overoll', 'Overoll'), (${ids.otherBrand}, 'other', 'Other brand')
  `;
  await admin`
    insert into public.stores (id, brand_id, code, name, active) values
      (${ids.storeA}, ${ids.brand}, 'chalandri', 'Chalandri', true),
      (${ids.storeB}, ${ids.brand}, 'aigaleo', 'Aigaleo', true),
      (${ids.closedStore}, ${ids.brand}, 'closed', 'Closed store', false),
      (${ids.otherStore}, ${ids.otherBrand}, 'other-1', 'Other 1', true)
  `;
  await admin`
    insert into public.staff_roles (user_id, brand_id, store_id, role) values
      (${ids.hq}, ${ids.brand}, null, 'hq_admin'),
      (${ids.deviceA}, ${ids.brand}, ${ids.storeA}, 'store_device'),
      (${ids.deviceB}, ${ids.brand}, ${ids.storeB}, 'store_device'),
      (${ids.deviceClosed}, ${ids.brand}, ${ids.closedStore}, 'store_device'),
      (${ids.otherBrandDevice}, ${ids.otherBrand}, ${ids.otherStore}, 'store_device'),
      (${ids.managerA}, ${ids.brand}, ${ids.storeA}, 'store_manager'),
      (${ids.platform}, null, null, 'platform_admin')
  `;
  await admin`
    insert into public.employees (id, brand_id, store_id, display_name, pin_hash, active) values
      (${ids.maria}, ${ids.brand}, ${ids.storeA}, 'Maria', extensions.crypt(${pins.maria}, extensions.gen_salt('bf')), true),
      (${ids.nikos}, ${ids.brand}, ${ids.storeB}, 'Nikos', extensions.crypt(${pins.nikos}, extensions.gen_salt('bf')), true),
      (${ids.retiredA}, ${ids.brand}, ${ids.storeA}, 'Retired', extensions.crypt(${pins.retiredA}, extensions.gen_salt('bf')), false),
      (${ids.closedEmployee}, ${ids.brand}, ${ids.closedStore}, 'Closed', extensions.crypt(${pins.closedEmployee}, extensions.gen_salt('bf')), true),
      (${ids.otherEmployee}, ${ids.otherBrand}, ${ids.otherStore}, 'Other', extensions.crypt(${pins.otherEmployee}, extensions.gen_salt('bf')), true)
  `;
  await admin`
    insert into public.rewards (id, brand_id, name_el, name_en, shelf_price_cents, base_cost, min_tier, active) values
      (${ids.espresso}, ${ids.brand}, 'Espresso', 'Espresso', 220, 300, null, true),
      (${ids.croissant}, ${ids.brand}, 'Κρουασάν', 'Croissant', 350, 500, null, true),
      (${ids.goldOnly}, ${ids.brand}, 'Μόνο Gold', 'Gold only', 300, 400, 'gold', true),
      (${ids.retiredReward}, ${ids.brand}, 'Παλιό', 'Retired', 300, 400, null, false),
      (${ids.otherReward}, ${ids.otherBrand}, 'Άλλο', 'Other', 220, 300, null, true)
  `;
}

let keyCounter = 0;
/** A fresh idempotency key. */
export const key = (label = 'k'): string => `${label}-${++keyCounter}-${Math.random().toString(36).slice(2, 8)}`;

export async function newUser(admin: Sql): Promise<string> {
  const [row] = await admin<{ id: string }[]>`insert into auth.users (id) values (gen_random_uuid()) returning id`;
  return row!.id;
}

export interface TestMember {
  userId: string;
  memberId: string;
  memberCode: string;
}

/** A new member joined through joinMember, optionally put straight into a tier. */
export async function newMember(
  server: Sql,
  admin: Sql,
  options: { brandSlug?: string; tier?: 'classic' | 'gold' | 'club'; firstName?: string } = {},
): Promise<TestMember> {
  const userId = await newUser(admin);
  const joined = await joinMember(server, {
    userId,
    brandSlug: options.brandSlug ?? 'overoll',
    firstName: options.firstName ?? 'Eleni',
    idempotencyKey: key('join'),
    now: new Date('2027-01-01T08:00:00Z'),
  });
  if (!joined.ok) throw new Error(`join failed: ${joined.code}`);
  if (options.tier) await admin`update public.members set tier = ${options.tier} where id = ${joined.memberId}`;
  return { userId, memberId: joined.memberId, memberCode: joined.memberCode };
}

/** Put points on a member without touching tiers (an HQ adjustment). */
export async function givePoints(admin: Sql, memberId: string, points: number): Promise<void> {
  await admin`
    insert into public.ledger_entries (brand_id, member_id, kind, points, reason, idempotency_key)
    select brand_id, id, 'adjust', ${points}, 'test balance', ${key('adjust')} from public.members where id = ${memberId}
  `;
}

async function secretOf(admin: Sql, memberId: string): Promise<{ code: string; secret: string; passVersion: number }> {
  const [row] = await admin<{ member_code: string; qr_secret: string; pass_version: number }[]>`
    select m.member_code, s.qr_secret, s.pass_version
    from public.members m join public.member_secrets s on s.member_id = m.id where m.id = ${memberId}
  `;
  return { code: row!.member_code, secret: row!.qr_secret, passVersion: row!.pass_version };
}

/** What the member's app shows at `at`. */
export async function rotatingToken(admin: Sql, memberId: string, at: Date): Promise<string> {
  const s = await secretOf(admin, memberId);
  return createRotatingToken(s.code, s.secret, at, defaultConfig);
}

/** The member's Wallet pass code. */
export async function walletToken(admin: Sql, memberId: string): Promise<string> {
  const s = await secretOf(admin, memberId);
  return createWalletToken(s.code, s.secret, s.passVersion);
}

export async function balanceOf(admin: Sql, memberId: string): Promise<number> {
  const [row] = await admin<{ balance: number }[]>`select balance from public.member_balances where member_id = ${memberId}`;
  return row!.balance;
}

export async function ledgerCount(admin: Sql, memberId: string, kind?: string): Promise<number> {
  const [row] = kind
    ? await admin<{ n: number }[]>`select count(*)::int as n from public.ledger_entries where member_id = ${memberId} and kind = ${kind}`
    : await admin<{ n: number }[]>`select count(*)::int as n from public.ledger_entries where member_id = ${memberId}`;
  return row!.n;
}

/** Minutes/seconds after a base time. */
export const at = (base: string, offsetSeconds = 0): Date => new Date(new Date(base).getTime() + offsetSeconds * 1000);
