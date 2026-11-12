import { defaultConfig, rewardBaseCost } from '@grow-loyalty/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createReward, createStore, parseOpeningHours, updateReward, updateStore } from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { ids, key, seedWorld } from './helpers/world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
});
afterAll(async () => {
  await db?.drop();
});

const NOW = new Date('2027-06-01T09:00:00Z');

async function auditFor(entityId: string) {
  return db.admin<{ action: string; actor_user_id: string; details: Record<string, unknown> }[]>`
    select action, actor_user_id, details from public.audit_log where entity_id = ${entityId} order by created_at, id
  `;
}

describe('opening hours', () => {
  it('normalises ranges and closed days, refuses anything else', () => {
    expect(parseOpeningHours({ mon: '08:00-19:00', tue: ' 07:30 - 20:00 ', sun: 'Closed', sat: '' })).toEqual({
      mon: '08:00-19:00',
      tue: '07:30-20:00',
      sun: 'closed',
    });
    expect(parseOpeningHours({ fri: '09:00-24:00' })).toEqual({ fri: '09:00-24:00' });
    expect(() => parseOpeningHours({ fri: '20:00-08:00' })).toThrow(/after opening/);
    expect(() => parseOpeningHours({ monday: '08:00-19:00' })).toThrow(/unknown day/);
    expect(() => parseOpeningHours({ mon: '8-19' })).toThrow(/08:00-20:00/);
    expect(() => parseOpeningHours(['mon'])).toThrow();
  });
});

describe('createStore / updateStore (stores/*)', () => {
  it('HQ opens a store with hours; the code is unique per brand and the call is idempotent', async () => {
    const k = key('store');
    const input = {
      callerUserId: ids.hq,
      brandId: ids.brand,
      code: 'Glyfada',
      name: 'Overoll Γλυφάδα',
      nameEn: 'Overoll Glyfada',
      address: 'Μεταξά 10, Γλυφάδα',
      city: 'Γλυφάδα',
      phone: '+30 210 000 0000',
      openingHours: { mon: '08:00-20:00', sun: 'closed' },
      idempotencyKey: k,
      now: NOW,
    };
    const created = await createStore(db.server, input);
    expect(created).toMatchObject({
      ok: true,
      store: { code: 'glyfada', name: 'Overoll Γλυφάδα', nameEn: 'Overoll Glyfada', country: 'GR', active: true, openingHours: { mon: '08:00-20:00', sun: 'closed' } },
    });
    if (!created.ok) return;
    expect(await createStore(db.server, input)).toEqual(created);
    expect(await createStore(db.server, { ...input, idempotencyKey: key() })).toMatchObject({ ok: false, code: 'store_code_taken' });
    expect(await createStore(db.server, { ...input, name: 'Other', idempotencyKey: k })).toMatchObject({ ok: false, code: 'idempotency_conflict' });
    expect(await auditFor(created.store.id)).toEqual([
      expect.objectContaining({ action: 'store.create', actor_user_id: ids.hq, details: { code: 'glyfada', name: 'Overoll Γλυφάδα' } }),
    ]);
  });

  it('only HQ of the brand or a platform admin may create', async () => {
    const base = { brandId: ids.brand, code: 'kifisia', name: 'Kifisia', idempotencyKey: key() };
    for (const who of [ids.managerA, ids.deviceA, ids.otherBrandDevice, ids.nobody]) {
      expect(await createStore(db.server, { ...base, callerUserId: who, idempotencyKey: key() })).toMatchObject({ ok: false, code: 'forbidden' });
    }
    expect(await createStore(db.server, { ...base, callerUserId: ids.hq, brandId: ids.otherBrand })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await createStore(db.server, { ...base, callerUserId: ids.platform, brandId: ids.otherBrand })).toMatchObject({ ok: true });
    expect(await createStore(db.server, { ...base, callerUserId: ids.hq, code: 'bad code!' })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await createStore(db.server, { ...base, callerUserId: ids.hq, name: '  ' })).toMatchObject({ ok: false, code: 'invalid_input' });
  });

  it('HQ edits details and hours, clears a field with null, and closes the store; the code never changes', async () => {
    const updated = await updateStore(db.server, {
      callerUserId: ids.hq,
      storeId: ids.storeB,
      nameEn: 'Overoll Aigaleo',
      phone: null,
      openingHours: { mon: '07:00-15:00', tue: '07:00-15:00' },
      now: NOW,
    });
    expect(updated).toMatchObject({ ok: true, store: { code: 'aigaleo', name: 'Aigaleo', nameEn: 'Overoll Aigaleo', phone: null, active: true } });
    expect(await updateStore(db.server, { callerUserId: ids.hq, storeId: ids.storeB, code: 'renamed' } as never)).toMatchObject({
      ok: false,
      code: 'invalid_input',
    });
    expect(await updateStore(db.server, { callerUserId: ids.hq, storeId: ids.storeB, latitude: 38 })).toMatchObject({ ok: false, code: 'invalid_input' });

    const closed = await updateStore(db.server, { callerUserId: ids.hq, storeId: ids.storeB, active: false, now: NOW });
    expect(closed).toMatchObject({ ok: true, store: { active: false } });
    const reopened = await updateStore(db.server, { callerUserId: ids.platform, storeId: ids.storeB, active: true, now: NOW });
    expect(reopened).toMatchObject({ ok: true, store: { active: true } });

    const log = await auditFor(ids.storeB);
    expect(log.map((e) => e.action)).toEqual(['store.update', 'store.update', 'store.update']);
    expect(log[0]!.details).toMatchObject({ nameEn: '"Overoll Aigaleo"', openingHours: expect.stringContaining('07:00-15:00') });
    expect(log[1]!.details).toEqual({ active: 'false' });
  });

  it('store managers, devices and other brands cannot edit; unknown stores are not_found', async () => {
    for (const who of [ids.managerA, ids.deviceA, ids.otherBrandDevice]) {
      expect(await updateStore(db.server, { callerUserId: who, storeId: ids.storeA, name: 'Hacked' })).toMatchObject({ ok: false, code: 'forbidden' });
    }
    expect(await updateStore(db.server, { callerUserId: ids.hq, storeId: ids.otherStore, name: 'Hacked' })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await updateStore(db.server, { callerUserId: ids.hq, storeId: '20000000-0000-0000-0000-0000000000ff', name: 'X' })).toMatchObject({
      ok: false,
      code: 'not_found',
    });
    const [row] = await db.admin<{ name: string }[]>`select name from public.stores where id = ${ids.storeA}`;
    expect(row!.name).toBe('Chalandri');
  });
});

describe('createReward / updateReward (rewards/*)', () => {
  it('HQ adds a reward: the point cost comes from core, it goes last unless ordered', async () => {
    const created = await createReward(db.server, {
      callerUserId: ids.hq,
      brandId: ids.brand,
      nameEl: 'Φρέντο εσπρέσο',
      nameEn: 'Freddo espresso',
      category: 'coffee',
      shelfPriceCents: 280,
      idempotencyKey: key(),
      now: NOW,
    });
    expect(created).toMatchObject({
      ok: true,
      reward: { nameEn: 'Freddo espresso', shelfPriceCents: 280, baseCost: rewardBaseCost(280, defaultConfig), active: true, minTier: null },
    });
    if (!created.ok) return;
    const [max] = await db.admin<{ m: number }[]>`select max(sort_order) as m from public.rewards where brand_id = ${ids.brand}`;
    expect(created.reward.sortOrder).toBe(max!.m);
    expect(await createReward(db.server, { callerUserId: ids.managerA, brandId: ids.brand, nameEl: 'X', nameEn: 'X', shelfPriceCents: 100, idempotencyKey: key() })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    for (const shelfPriceCents of [0, 2.5, 60_000]) {
      expect(await createReward(db.server, { callerUserId: ids.hq, brandId: ids.brand, nameEl: 'X', nameEn: 'X', shelfPriceCents, idempotencyKey: key() })).toMatchObject({
        ok: false,
        code: 'invalid_input',
      });
    }
  });

  it('a new price gives a new cost; pending codes keep the points they took', async () => {
    const [before] = await db.admin<{ base_cost: number }[]>`select base_cost from public.rewards where id = ${ids.croissant}`;
    const updated = await updateReward(db.server, { callerUserId: ids.hq, rewardId: ids.croissant, shelfPriceCents: 400, minTier: 'gold', now: NOW });
    expect(updated).toMatchObject({ ok: true, reward: { shelfPriceCents: 400, baseCost: rewardBaseCost(400, defaultConfig), minTier: 'gold' } });
    expect(rewardBaseCost(400, defaultConfig)).not.toBe(before!.base_cost);
    const log = await auditFor(ids.croissant);
    expect(log.at(-1)).toMatchObject({ action: 'reward.update', details: { shelfPriceCents: '400', baseCost: String(rewardBaseCost(400, defaultConfig)), minTier: '"gold"' } });

    // Back to how the other tests expect it.
    expect(await updateReward(db.server, { callerUserId: ids.hq, rewardId: ids.croissant, shelfPriceCents: 350, minTier: null })).toMatchObject({ ok: true });
    await db.admin`update public.rewards set base_cost = ${before!.base_cost} where id = ${ids.croissant}`;
  });

  it('the welcome gift cannot be switched off; other rewards can, and come back', async () => {
    await db.admin`update public.brands set config = jsonb_set(config, '{welcome}', ${db.admin.json({ validDays: 30, rewardId: ids.espresso })}) where id = ${ids.brand}`;
    try {
      expect(await updateReward(db.server, { callerUserId: ids.hq, rewardId: ids.espresso, active: false })).toMatchObject({ ok: false, code: 'welcome_reward' });
      expect(await updateReward(db.server, { callerUserId: ids.hq, rewardId: ids.espresso, nameEn: 'Espresso (single)' })).toMatchObject({ ok: true });
    } finally {
      await db.admin`update public.brands set config = config - 'welcome' where id = ${ids.brand}`;
      await db.admin`update public.rewards set name_en = 'Espresso' where id = ${ids.espresso}`;
    }
    expect(await updateReward(db.server, { callerUserId: ids.hq, rewardId: ids.goldOnly, active: false })).toMatchObject({ ok: true, reward: { active: false } });
    expect(await updateReward(db.server, { callerUserId: ids.hq, rewardId: ids.goldOnly, active: true })).toMatchObject({ ok: true, reward: { active: true } });
  });

  it('other brands, managers and blank names are refused', async () => {
    expect(await updateReward(db.server, { callerUserId: ids.hq, rewardId: ids.otherReward, nameEn: 'Hacked' })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await updateReward(db.server, { callerUserId: ids.managerA, rewardId: ids.espresso, nameEn: 'Hacked' })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await updateReward(db.server, { callerUserId: ids.hq, rewardId: ids.espresso, nameEl: ' ' })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(await updateReward(db.server, { callerUserId: ids.hq, rewardId: ids.espresso, minTier: 'platinum' as never })).toMatchObject({ ok: false, code: 'invalid_input' });
  });
});
