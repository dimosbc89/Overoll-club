import {
  type CatalogReward,
  type ProgramConfig,
  type TierId,
  createWalletToken,
  nextRewardProgress,
  resolveConfig,
} from '@grow-loyalty/core';
import type { Db } from '../result.js';
import { groupMemberCode } from './design.js';

/** Everything a Wallet pass shows for one member, read in one go. */
export interface WalletPassData {
  memberId: string;
  brandId: string;
  brandSlug: string;
  /** brands.name, e.g. "Koala Coffee": Apple organizationName, Google issuerName. */
  brandName: string;
  config: ProgramConfig;
  memberCode: string;
  firstName: string;
  tier: TierId;
  points: number;
  /** The static Wallet QR (core createWalletToken) and the code printed under it. */
  barcode: string;
  barcodeText: string;
  passVersion: number;
  qrSecret: string;
  /** Last change of what the pass shows (Apple Last-Modified). */
  changedAt: Date;
  /** The cheapest reward the member can't afford yet (core nextRewardProgress). */
  nextReward: { id: string; nameEl: string; nameEn: string } | null;
}

interface Row {
  member_id: string;
  brand_id: string;
  slug: string;
  brand_name: string;
  config: unknown;
  member_code: string;
  first_name: string;
  tier: TierId;
  qr_secret: string;
  pass_version: number;
  wallet_changed_at: Date;
  balance: string | number | null;
}

interface RewardRow {
  id: string;
  name_el: string;
  name_en: string;
  base_cost: number;
  min_tier: TierId | null;
}

/** The pass of a member who has one (not deleted, QR secret present); null otherwise. */
export async function loadWalletPass(sql: Db, memberId: string): Promise<WalletPassData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return null;
  const [row] = await sql<Row[]>`
    select m.id as member_id, m.brand_id, b.slug, b.name as brand_name, b.config, m.member_code, m.first_name, m.tier,
           s.qr_secret, s.pass_version, s.wallet_changed_at, coalesce(mb.balance, 0) as balance
    from public.members m
    join public.brands b on b.id = m.brand_id
    join public.member_secrets s on s.member_id = m.id
    left join public.member_balances mb on mb.member_id = m.id
    where m.id = ${memberId} and m.deleted_at is null
  `;
  if (!row) return null;
  const rewards = await sql<RewardRow[]>`
    select id, name_el, name_en, base_cost, min_tier from public.rewards
    where brand_id = ${row.brand_id} and active
  `;
  const config = resolveConfig(row.config);
  const points = Number(row.balance ?? 0);
  const catalog: CatalogReward[] = rewards.map((r) => ({
    id: r.id,
    baseCost: r.base_cost,
    ...(r.min_tier ? { minTier: r.min_tier } : {}),
    active: true,
  }));
  const next = nextRewardProgress(points, row.tier, catalog, config);
  const nextRow = next ? rewards.find((r) => r.id === next.rewardId) : undefined;
  return {
    memberId: row.member_id,
    brandId: row.brand_id,
    brandSlug: row.slug,
    brandName: row.brand_name,
    config,
    memberCode: row.member_code,
    firstName: row.first_name,
    tier: row.tier,
    points,
    barcode: createWalletToken(row.member_code, row.qr_secret, row.pass_version),
    barcodeText: groupMemberCode(row.member_code),
    passVersion: row.pass_version,
    qrSecret: row.qr_secret,
    changedAt: new Date(row.wallet_changed_at),
    nextReward: nextRow ? { id: nextRow.id, nameEl: nextRow.name_el, nameEn: nextRow.name_en } : null,
  };
}

/** The signed-in user's member id in a brand, if they are a member (not deleted). */
export async function memberIdForUser(sql: Db, userId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const rows = await sql<{ id: string }[]>`
    select id from public.members where user_id = ${userId} and deleted_at is null order by created_at limit 2
  `;
  // One project per brand: a user is a member at most once.
  return rows.length === 1 ? rows[0]!.id : null;
}
