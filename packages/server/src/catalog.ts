import { type TierId, rewardBaseCost } from '@grow-loyalty/core';
import { brandAccess } from './internal/access.js';
import { audit } from './internal/audit.js';
import { loadBrand } from './internal/brand.js';
import { idempotent } from './internal/idempotency.js';
import * as input from './internal/input.js';
import { InputError } from './internal/input.js';
import { type Db, type Result, type Tx, fail } from './result.js';

/**
 * HQ edits the brand's stores and reward catalog (back office v0.6). The seed
 * fills a new brand once; from then on the database is the source and these
 * operations the only way to change it: HQ admins of the brand or platform
 * admins, each change in the audit log, reward point costs from
 * `@grow-loyalty/core` (`rewardBaseCost`, with the brand's config).
 */

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
/** Per weekday "HH:MM-HH:MM" or "closed"; a missing day is closed (apps' `todayHours`). */
export type OpeningHours = Partial<Record<Weekday, string>>;

export const STORE_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const STORE_NAME_MAX = 80;
export const STORE_ADDRESS_MAX = 160;
export const REWARD_NAME_MAX = 60;
export const REWARD_DESCRIPTION_MAX = 200;
/** Sanity bound on a reward's shelf price (€500). */
export const REWARD_PRICE_MAX_CENTS = 50_000;
const TIERS: readonly TierId[] = ['classic', 'gold', 'club'];
const RANGE = /^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-4]):([0-5]\d)$/;

const has = (raw: object, key: string) => Object.prototype.hasOwnProperty.call(raw, key) && (raw as Record<string, unknown>)[key] !== undefined;

function required(value: unknown, field: string, max: number): string {
  const v = input.optionalText(value, field, max);
  if (!v) throw new InputError(`${field} must not be blank`);
  return v;
}

export function parseOpeningHours(value: unknown): OpeningHours {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new InputError('openingHours must be an object keyed by weekday');
  const out: OpeningHours = {};
  for (const [day, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!(WEEKDAYS as readonly string[]).includes(day)) throw new InputError(`openingHours: unknown day ${day}`);
    if (raw === null || raw === undefined || raw === '') continue;
    if (typeof raw !== 'string') throw new InputError(`openingHours.${day} must be text`);
    const v = raw.trim().toLowerCase();
    if (v === 'closed') {
      out[day as Weekday] = 'closed';
      continue;
    }
    const m = RANGE.exec(v);
    if (!m) throw new InputError(`openingHours.${day} must look like 08:00-20:00 or closed`);
    const open = `${m[1]}:${m[2]}`;
    const close = `${m[3]}:${m[4]}`;
    if (close === '24:00' ? false : close <= open) throw new InputError(`openingHours.${day}: closing time must be after opening time`);
    if (m[3] === '24' && m[4] !== '00') throw new InputError(`openingHours.${day}: 24:00 is the latest closing time`);
    out[day as Weekday] = `${open}-${close}`;
  }
  return out;
}

function phone(value: unknown): string | null {
  const v = input.optionalText(value, 'phone', 30);
  if (v && !/^\+?[0-9 ()-]{5,29}$/.test(v)) throw new InputError('phone may contain digits, spaces, ( ) - and a leading +');
  return v;
}

function coordinate(value: unknown, field: string, limit: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new InputError(`${field} must be a number between -${limit} and ${limit}`);
  }
  return value;
}

function country(value: unknown): 'GR' | 'CY' {
  if (value === undefined || value === null) return 'GR';
  if (value !== 'GR' && value !== 'CY') throw new InputError('country must be GR or CY');
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new InputError(`${field} must be true or false`);
  return value;
}

function priceCents(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > REWARD_PRICE_MAX_CENTS) {
    throw new InputError(`shelfPriceCents must be a whole number of cents between 1 and ${REWARD_PRICE_MAX_CENTS}`);
  }
  return value as number;
}

function minTier(value: unknown): TierId | null {
  if (value === null || value === undefined) return null;
  if (!TIERS.includes(value as TierId)) throw new InputError(`minTier must be one of ${TIERS.join(', ')} or null`);
  return value as TierId;
}

function category(value: unknown): string {
  const v = input.optionalText(value, 'category', 30);
  if (!v || !/^[a-z][a-z0-9-]*$/.test(v)) throw new InputError('category must be a short lower-case word');
  return v;
}

function sortOrder(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100_000) {
    throw new InputError('sortOrder must be a whole number from 0 to 100000');
  }
  return value as number;
}

async function hqOf(tx: Tx, userId: string, brandId: string): Promise<boolean> {
  const access = await brandAccess(tx, userId, brandId);
  return access.hq || access.platform;
}

async function brandExists(tx: Tx, brandId: string): Promise<boolean> {
  const [row] = await tx<{ id: string }[]>`select id from public.brands where id = ${brandId}`;
  return Boolean(row);
}

/** Audit details: which fields changed (old → new, short values only). */
function changes(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of Object.keys(after)) {
    const a = JSON.stringify(before[key] ?? null);
    const b = JSON.stringify(after[key] ?? null);
    if (a !== b) out[key] = b.length > 200 ? `${b.slice(0, 197)}...` : b;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export interface StoreView {
  id: string;
  brandId: string;
  /** In the counter QR join link; fixed once the store exists. */
  code: string;
  name: string;
  nameEn: string | null;
  address: string | null;
  addressEn: string | null;
  city: string | null;
  country: 'GR' | 'CY';
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  openingHours: OpeningHours;
  active: boolean;
}

interface StoreDbRow {
  id: string;
  brand_id: string;
  code: string;
  name: string;
  name_en: string | null;
  address: string | null;
  address_en: string | null;
  city: string | null;
  country: 'GR' | 'CY';
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  opening_hours: OpeningHours;
  active: boolean;
}

const storeView = (r: StoreDbRow): StoreView => ({
  id: r.id,
  brandId: r.brand_id,
  code: r.code,
  name: r.name,
  nameEn: r.name_en,
  address: r.address,
  addressEn: r.address_en,
  city: r.city,
  country: r.country,
  phone: r.phone,
  latitude: r.latitude,
  longitude: r.longitude,
  openingHours: r.opening_hours ?? {},
  active: r.active,
});

const STORE_COLUMNS = ['id', 'brand_id', 'code', 'name', 'name_en', 'address', 'address_en', 'city', 'country', 'phone', 'latitude', 'longitude', 'opening_hours', 'active'];

/** Editable store fields; on update, a field left out keeps its value and null clears an optional one. */
export interface StoreFields {
  name?: string;
  nameEn?: string | null;
  address?: string | null;
  addressEn?: string | null;
  city?: string | null;
  country?: 'GR' | 'CY';
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  openingHours?: OpeningHours;
}

type StoreValues = Omit<StoreView, 'id' | 'brandId' | 'code' | 'active'>;

function parseStoreFields(raw: StoreFields, base: StoreValues): StoreValues {
  const v: StoreValues = { ...base };
  if (has(raw, 'name')) v.name = required(raw.name, 'name', STORE_NAME_MAX);
  if (has(raw, 'nameEn')) v.nameEn = input.optionalText(raw.nameEn, 'nameEn', STORE_NAME_MAX);
  if (has(raw, 'address')) v.address = input.optionalText(raw.address, 'address', STORE_ADDRESS_MAX);
  if (has(raw, 'addressEn')) v.addressEn = input.optionalText(raw.addressEn, 'addressEn', STORE_ADDRESS_MAX);
  if (has(raw, 'city')) v.city = input.optionalText(raw.city, 'city', STORE_NAME_MAX);
  if (has(raw, 'country')) v.country = country(raw.country);
  if (has(raw, 'phone')) v.phone = phone(raw.phone);
  if (has(raw, 'latitude')) v.latitude = coordinate(raw.latitude, 'latitude', 90);
  if (has(raw, 'longitude')) v.longitude = coordinate(raw.longitude, 'longitude', 180);
  if (has(raw, 'openingHours')) v.openingHours = parseOpeningHours(raw.openingHours);
  if ((v.latitude === null) !== (v.longitude === null)) throw new InputError('latitude and longitude go together');
  return v;
}

export interface CreateStoreInput extends StoreFields {
  /** HQ admin of the brand, or a platform admin. */
  callerUserId: string;
  brandId: string;
  code: string;
  name: string;
  idempotencyKey: string;
  now?: Date;
}

export type CreateStoreError = 'invalid_input' | 'idempotency_conflict' | 'forbidden' | 'brand_not_found' | 'store_code_taken';
export type CreateStoreResult = Result<{ store: StoreView }, CreateStoreError>;

/** Open a new store (active at once: it shows in the store list and can earn points). */
export async function createStore(sql: Db, raw: CreateStoreInput): Promise<CreateStoreResult> {
  const parsed = input.parseInput(() => {
    const code = input.optionalText(raw.code, 'code', 40)?.toLowerCase();
    if (!code || code.length < 2 || !STORE_CODE_PATTERN.test(code)) {
      throw new InputError('code must be 2–40 lower-case letters, digits and single dashes');
    }
    const empty: StoreValues = {
      name: '',
      nameEn: null,
      address: null,
      addressEn: null,
      city: null,
      country: 'GR',
      phone: null,
      latitude: null,
      longitude: null,
      openingHours: {},
    };
    return {
      callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
      brandId: input.uuid(raw.brandId, 'brandId'),
      code,
      values: parseStoreFields({ ...raw, name: raw.name ?? '' }, empty),
      idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
      now: input.now(raw.now),
    };
  });
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;
  const v = i.values;

  return sql.begin(async (tx): Promise<CreateStoreResult> => {
    if (!(await brandExists(tx, i.brandId))) return fail('brand_not_found');
    if (!(await hqOf(tx, i.callerUserId, i.brandId))) return fail('forbidden');
    return idempotent(
      tx,
      {
        brandId: i.brandId,
        key: i.idempotencyKey,
        operation: 'create_store',
        actorUserId: i.callerUserId,
        request: { code: i.code, values: JSON.stringify(v) },
        now: i.now,
      },
      async (): Promise<CreateStoreResult> => {
        const [taken] = await tx`select 1 from public.stores where brand_id = ${i.brandId} and code = ${i.code}`;
        if (taken) return fail('store_code_taken');
        const [row] = await tx<StoreDbRow[]>`
          insert into public.stores (brand_id, code, name, name_en, address, address_en, city, country, phone,
            latitude, longitude, opening_hours, created_at, updated_at)
          values (${i.brandId}, ${i.code}, ${v.name}, ${v.nameEn}, ${v.address}, ${v.addressEn}, ${v.city}, ${v.country},
            ${v.phone}, ${v.latitude}, ${v.longitude}, ${tx.json(v.openingHours as Record<string, string>)}, ${i.now}, ${i.now})
          returning ${tx(STORE_COLUMNS)}
        `;
        if (!row) throw new Error('Store insert returned no row');
        await audit(tx, {
          brandId: i.brandId,
          actorUserId: i.callerUserId,
          action: 'store.create',
          entity: 'stores',
          entityId: row.id,
          details: { code: i.code, name: v.name },
          at: i.now,
        });
        return { ok: true, store: storeView(row) };
      },
    );
  });
}

export interface UpdateStoreInput extends StoreFields {
  callerUserId: string;
  storeId: string;
  /** false closes the store: hidden from members, the till stops earning; staff and history stay. */
  active?: boolean;
  now?: Date;
}

export type UpdateStoreError = 'invalid_input' | 'forbidden' | 'not_found';
export type UpdateStoreResult = Result<{ store: StoreView }, UpdateStoreError>;

/** Change a store's details, hours, or open/close it. Its code never changes (printed QR links). */
export async function updateStore(sql: Db, raw: UpdateStoreInput): Promise<UpdateStoreResult> {
  const parsed = input.parseInput(() => {
    if (has(raw, 'code')) throw new InputError('code cannot change: it is in the printed QR join links');
    return {
      callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
      storeId: input.uuid(raw.storeId, 'storeId'),
      active: has(raw, 'active') ? bool(raw.active, 'active') : undefined,
      now: input.now(raw.now),
    };
  });
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<UpdateStoreResult> => {
    const [current] = await tx<StoreDbRow[]>`
      select ${tx(STORE_COLUMNS)} from public.stores where id = ${i.storeId} for update
    `;
    if (!current) return fail('not_found');
    if (!(await hqOf(tx, i.callerUserId, current.brand_id))) return fail('forbidden');

    const before = storeView(current);
    const fields = input.parseInput(() => parseStoreFields(raw, before));
    if ('failure' in fields) return fields.failure;
    const v = fields.input;
    const active = i.active ?? current.active;

    const [row] = await tx<StoreDbRow[]>`
      update public.stores set
        name = ${v.name}, name_en = ${v.nameEn}, address = ${v.address}, address_en = ${v.addressEn},
        city = ${v.city}, country = ${v.country}, phone = ${v.phone}, latitude = ${v.latitude},
        longitude = ${v.longitude}, opening_hours = ${tx.json(v.openingHours as Record<string, string>)}, active = ${active}
      where id = ${current.id}
      returning ${tx(STORE_COLUMNS)}
    `;
    if (!row) throw new Error('Store update returned no row');
    const after = storeView(row);
    const changed = changes(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    if (Object.keys(changed).length) {
      await audit(tx, {
        brandId: current.brand_id,
        actorUserId: i.callerUserId,
        action: 'store.update',
        entity: 'stores',
        entityId: current.id,
        details: changed,
        at: i.now,
      });
    }
    return { ok: true, store: after };
  });
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export interface RewardView {
  id: string;
  brandId: string;
  nameEl: string;
  nameEn: string;
  descriptionEl: string | null;
  descriptionEn: string | null;
  category: string;
  shelfPriceCents: number;
  /** Points before the tier discount: core `rewardBaseCost(shelfPriceCents, brand config)`. */
  baseCost: number;
  minTier: TierId | null;
  active: boolean;
  sortOrder: number;
}

interface RewardDbRow {
  id: string;
  brand_id: string;
  name_el: string;
  name_en: string;
  description_el: string | null;
  description_en: string | null;
  category: string;
  shelf_price_cents: number;
  base_cost: number;
  min_tier: TierId | null;
  active: boolean;
  sort_order: number;
}

const rewardView = (r: RewardDbRow): RewardView => ({
  id: r.id,
  brandId: r.brand_id,
  nameEl: r.name_el,
  nameEn: r.name_en,
  descriptionEl: r.description_el,
  descriptionEn: r.description_en,
  category: r.category,
  shelfPriceCents: r.shelf_price_cents,
  baseCost: r.base_cost,
  minTier: r.min_tier,
  active: r.active,
  sortOrder: r.sort_order,
});

const REWARD_COLUMNS = ['id', 'brand_id', 'name_el', 'name_en', 'description_el', 'description_en', 'category', 'shelf_price_cents', 'base_cost', 'min_tier', 'active', 'sort_order'];

export interface RewardFields {
  nameEl?: string;
  nameEn?: string;
  descriptionEl?: string | null;
  descriptionEn?: string | null;
  category?: string;
  shelfPriceCents?: number;
  minTier?: TierId | null;
  sortOrder?: number;
}

type RewardValues = Omit<RewardView, 'id' | 'brandId' | 'baseCost' | 'active'>;

function parseRewardFields(raw: RewardFields, base: RewardValues): RewardValues {
  const v: RewardValues = { ...base };
  if (has(raw, 'nameEl')) v.nameEl = required(raw.nameEl, 'nameEl', REWARD_NAME_MAX);
  if (has(raw, 'nameEn')) v.nameEn = required(raw.nameEn, 'nameEn', REWARD_NAME_MAX);
  if (has(raw, 'descriptionEl')) v.descriptionEl = input.optionalText(raw.descriptionEl, 'descriptionEl', REWARD_DESCRIPTION_MAX);
  if (has(raw, 'descriptionEn')) v.descriptionEn = input.optionalText(raw.descriptionEn, 'descriptionEn', REWARD_DESCRIPTION_MAX);
  if (has(raw, 'category')) v.category = category(raw.category);
  if (has(raw, 'shelfPriceCents')) v.shelfPriceCents = priceCents(raw.shelfPriceCents);
  if (has(raw, 'minTier')) v.minTier = minTier(raw.minTier);
  if (has(raw, 'sortOrder')) v.sortOrder = sortOrder(raw.sortOrder);
  return v;
}

export interface CreateRewardInput extends RewardFields {
  callerUserId: string;
  brandId: string;
  nameEl: string;
  nameEn: string;
  shelfPriceCents: number;
  idempotencyKey: string;
  now?: Date;
}

export type CreateRewardError = 'invalid_input' | 'idempotency_conflict' | 'forbidden' | 'brand_not_found';
export type CreateRewardResult = Result<{ reward: RewardView }, CreateRewardError>;

/** Add a reward to the catalog (active at once). Without a sort order it goes last. */
export async function createReward(sql: Db, raw: CreateRewardInput): Promise<CreateRewardResult> {
  const parsed = input.parseInput(() => {
    const empty: RewardValues = {
      nameEl: '',
      nameEn: '',
      descriptionEl: null,
      descriptionEn: null,
      category: 'other',
      shelfPriceCents: 0,
      minTier: null,
      sortOrder: -1,
    };
    const v = parseRewardFields(
      { ...raw, nameEl: raw.nameEl ?? '', nameEn: raw.nameEn ?? '', shelfPriceCents: raw.shelfPriceCents ?? 0 },
      empty,
    );
    return {
      callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
      brandId: input.uuid(raw.brandId, 'brandId'),
      values: v,
      idempotencyKey: input.idempotencyKey(raw.idempotencyKey),
      now: input.now(raw.now),
    };
  });
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;
  const v = i.values;

  return sql.begin(async (tx): Promise<CreateRewardResult> => {
    if (!(await brandExists(tx, i.brandId))) return fail('brand_not_found');
    if (!(await hqOf(tx, i.callerUserId, i.brandId))) return fail('forbidden');
    const brand = await loadBrand(tx, i.brandId);
    return idempotent(
      tx,
      {
        brandId: i.brandId,
        key: i.idempotencyKey,
        operation: 'create_reward',
        actorUserId: i.callerUserId,
        request: { values: JSON.stringify(v) },
        now: i.now,
      },
      async (): Promise<CreateRewardResult> => {
        const baseCost = rewardBaseCost(v.shelfPriceCents, brand.config);
        const [last] = await tx<{ next: number }[]>`
          select coalesce(max(sort_order), 0) + 10 as next from public.rewards where brand_id = ${i.brandId}
        `;
        const order = v.sortOrder >= 0 ? v.sortOrder : (last?.next ?? 10);
        const [row] = await tx<RewardDbRow[]>`
          insert into public.rewards (brand_id, name_el, name_en, description_el, description_en, category,
            shelf_price_cents, base_cost, min_tier, sort_order, created_at, updated_at)
          values (${i.brandId}, ${v.nameEl}, ${v.nameEn}, ${v.descriptionEl}, ${v.descriptionEn}, ${v.category},
            ${v.shelfPriceCents}, ${baseCost}, ${v.minTier}::public.tier_id, ${order}, ${i.now}, ${i.now})
          returning ${tx(REWARD_COLUMNS)}
        `;
        if (!row) throw new Error('Reward insert returned no row');
        await audit(tx, {
          brandId: i.brandId,
          actorUserId: i.callerUserId,
          action: 'reward.create',
          entity: 'rewards',
          entityId: row.id,
          details: { nameEl: v.nameEl, shelfPriceCents: v.shelfPriceCents, baseCost },
          at: i.now,
        });
        return { ok: true, reward: rewardView(row) };
      },
    );
  });
}

export interface UpdateRewardInput extends RewardFields {
  callerUserId: string;
  rewardId: string;
  /** false takes it out of the app; codes already made stay valid until they expire. */
  active?: boolean;
  now?: Date;
}

export type UpdateRewardError = 'invalid_input' | 'forbidden' | 'not_found' | 'welcome_reward';
export type UpdateRewardResult = Result<{ reward: RewardView }, UpdateRewardError>;

/**
 * Change a reward. A new shelf price gives a new point cost (core, brand
 * config); codes already made keep the points they took. The brand's welcome
 * gift cannot be switched off while it is the welcome gift.
 */
export async function updateReward(sql: Db, raw: UpdateRewardInput): Promise<UpdateRewardResult> {
  const parsed = input.parseInput(() => ({
    callerUserId: input.uuid(raw.callerUserId, 'callerUserId'),
    rewardId: input.uuid(raw.rewardId, 'rewardId'),
    active: has(raw, 'active') ? bool(raw.active, 'active') : undefined,
    now: input.now(raw.now),
  }));
  if ('failure' in parsed) return parsed.failure;
  const i = parsed.input;

  return sql.begin(async (tx): Promise<UpdateRewardResult> => {
    const [current] = await tx<RewardDbRow[]>`
      select ${tx(REWARD_COLUMNS)} from public.rewards where id = ${i.rewardId} for update
    `;
    if (!current) return fail('not_found');
    if (!(await hqOf(tx, i.callerUserId, current.brand_id))) return fail('forbidden');

    const before = rewardView(current);
    const fields = input.parseInput(() => parseRewardFields(raw, before));
    if ('failure' in fields) return fields.failure;
    const v = fields.input;
    const active = i.active ?? current.active;
    const brand = await loadBrand(tx, current.brand_id);
    if (!active && brand.config.welcome.rewardId === current.id) return fail('welcome_reward');
    const baseCost = rewardBaseCost(v.shelfPriceCents, brand.config);

    const [row] = await tx<RewardDbRow[]>`
      update public.rewards set
        name_el = ${v.nameEl}, name_en = ${v.nameEn}, description_el = ${v.descriptionEl},
        description_en = ${v.descriptionEn}, category = ${v.category}, shelf_price_cents = ${v.shelfPriceCents},
        base_cost = ${baseCost}, min_tier = ${v.minTier}::public.tier_id, sort_order = ${v.sortOrder}, active = ${active}
      where id = ${current.id}
      returning ${tx(REWARD_COLUMNS)}
    `;
    if (!row) throw new Error('Reward update returned no row');
    const after = rewardView(row);
    const changed = changes(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    if (Object.keys(changed).length) {
      await audit(tx, {
        brandId: current.brand_id,
        actorUserId: i.callerUserId,
        action: 'reward.update',
        entity: 'rewards',
        entityId: current.id,
        details: changed,
        at: i.now,
      });
    }
    return { ok: true, reward: after };
  });
}
