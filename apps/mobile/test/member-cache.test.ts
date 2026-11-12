import { describe, expect, it } from 'vitest';

import type { MemberBundle } from '../src/lib/data';
import { createMemberCache, type KeyValueStore, type SecretVault } from '../src/lib/memberCache';

function memoryKv(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    getAllKeys: async () => [...data.keys()],
    multiRemove: async (keys) => keys.forEach((k) => data.delete(k)),
  };
}

function memoryVault(): SecretVault & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

const uid = '6f1c2a54-0d9e-4c55-9f43-1d7e2b3a9c10';
const bundle = {
  member: { id: 'm1', member_code: 'K7Q2M9' },
  secret: { qr_secret: 'c2VjcmV0LXNlY3JldC1zZWNyZXQ', pass_version: 3 },
  loadedAt: '2026-11-12T08:00:00Z',
} as unknown as MemberBundle;

describe('member cache', () => {
  it('native: keeps the QR secret only in the vault', async () => {
    const kv = memoryKv();
    const vault = memoryVault();
    const cache = createMemberCache({ kv, vault, prefix: 'koala.' });
    await cache.save(uid, bundle);

    const plain = kv.data.get(`koala.member.${uid}`)!;
    expect(plain).not.toContain('c2VjcmV0');
    expect(vault.data.get(`koala.qr.${uid}`)).toContain('c2VjcmV0');
    expect(await cache.load(uid)).toEqual(bundle);
  });

  it('native: a secret that cannot be read (restored phone) still opens the card, without a QR', async () => {
    const kv = memoryKv();
    const vault = memoryVault();
    const cache = createMemberCache({ kv, vault, prefix: 'koala.' });
    await cache.save(uid, bundle);
    vault.get = async () => {
      throw new Error('could not decrypt');
    };
    const loaded = await cache.load(uid);
    expect(loaded?.member).toEqual(bundle.member);
    expect(loaded?.secret).toBeNull();
  });

  it('native: sign-out removes the card and the secret, and leaves other brands alone', async () => {
    const kv = memoryKv();
    const vault = memoryVault();
    kv.data.set('overoll.member.x', '{}');
    kv.data.set('koala.lang', 'el');
    const cache = createMemberCache({ kv, vault, prefix: 'koala.' });
    await cache.save(uid, bundle);
    await cache.clear();
    expect([...kv.data.keys()].sort()).toEqual(['koala.lang', 'overoll.member.x']);
    expect(vault.data.size).toBe(0);
  });

  it('web: no vault, the secret stays with the card as before (same storage key)', async () => {
    const kv = memoryKv();
    const cache = createMemberCache({ kv, vault: null, prefix: 'koala.' });
    await cache.save(uid, bundle);
    expect(JSON.parse(kv.data.get(`koala.member.${uid}`)!)).toEqual({ v: 1, bundle });
    expect(await cache.load(uid)).toEqual(bundle);
    await cache.clear();
    expect(kv.data.size).toBe(0);
  });

  it('ignores a cache from another version or a damaged entry', async () => {
    const kv = memoryKv();
    kv.data.set(`koala.member.${uid}`, JSON.stringify({ v: 99, bundle }));
    const cache = createMemberCache({ kv, vault: memoryVault(), prefix: 'koala.' });
    expect(await cache.load(uid)).toBeNull();
    kv.data.set(`koala.member.${uid}`, '{not json');
    expect(await cache.load(uid)).toBeNull();
  });
});
