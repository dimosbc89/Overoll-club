import type { MemberBundle, SecretRow } from './data';

/** Plain key-value storage (AsyncStorage: localStorage on web, app files on iOS and Android). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: string[]): Promise<void>;
}

/** Encrypted storage for the QR secret (Keychain / Keystore). Absent on web. */
export interface SecretVault {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

interface Stored {
  v: number;
  bundle: MemberBundle;
  /** true: `bundle.secret` was taken out and lives in the vault. */
  vault?: boolean;
}

const VERSION = 1;

/**
 * The last member data seen on this device, so the card and its rotating QR
 * open without a connection. With a vault (the native apps) the QR secret is
 * kept apart in encrypted storage and the rest in plain storage; on the web it
 * stays in the browser's storage with the rest. Everything is removed on sign-out.
 */
export function createMemberCache(opts: { kv: KeyValueStore; vault: SecretVault | null; prefix: string }) {
  const { kv, vault, prefix } = opts;
  const bundleKey = (userId: string) => `${prefix}member.${userId}`;
  // SecureStore keys allow letters, digits, '.', '-' and '_' only; user ids are UUIDs.
  const secretKey = (userId: string) => `${prefix}qr.${userId.replace(/[^\w.-]/g, '_')}`;

  async function load(userId: string): Promise<MemberBundle | null> {
    try {
      const raw = await kv.getItem(bundleKey(userId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Stored;
      if (parsed.v !== VERSION) return null;
      if (!parsed.vault) return parsed.bundle;
      let secret: SecretRow | null = null;
      try {
        const s = vault ? await vault.get(secretKey(userId)) : null;
        secret = s ? (JSON.parse(s) as SecretRow) : null;
      } catch {
        // Unreadable after a restore to a new phone: the card loads it again online.
      }
      return { ...parsed.bundle, secret };
    } catch {
      return null;
    }
  }

  async function save(userId: string, bundle: MemberBundle): Promise<void> {
    try {
      if (vault) {
        if (bundle.secret) await vault.set(secretKey(userId), JSON.stringify(bundle.secret));
        else await vault.remove(secretKey(userId));
        const stored: Stored = { v: VERSION, bundle: { ...bundle, secret: null }, vault: true };
        await kv.setItem(bundleKey(userId), JSON.stringify(stored));
      } else {
        await kv.setItem(bundleKey(userId), JSON.stringify({ v: VERSION, bundle } satisfies Stored));
      }
    } catch {
      // Storage full or unavailable: the app still works online.
    }
  }

  async function clear(): Promise<void> {
    try {
      const keys = (await kv.getAllKeys()).filter((k) => k.startsWith(`${prefix}member.`));
      if (vault) {
        for (const k of keys) {
          await vault.remove(secretKey(k.slice(`${prefix}member.`.length))).catch(() => {});
        }
      }
      await kv.multiRemove(keys);
    } catch {
      // Nothing to clear.
    }
  }

  return { load, save, clear };
}
