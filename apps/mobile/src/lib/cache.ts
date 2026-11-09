import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MemberBundle } from './data';

/**
 * The last member data seen on this device, so the card and its rotating QR
 * open without a connection. Holds the member's QR secret: it never leaves
 * the device and is removed on sign-out. (Native: move it to the keychain
 * with expo-secure-store when the native apps ship.)
 */
const prefix = 'overoll.member.';
const VERSION = 1;

export async function loadCachedBundle(userId: string): Promise<MemberBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(prefix + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: number; bundle: MemberBundle };
    return parsed.v === VERSION ? parsed.bundle : null;
  } catch {
    return null;
  }
}

export async function saveCachedBundle(userId: string, bundle: MemberBundle): Promise<void> {
  try {
    await AsyncStorage.setItem(prefix + userId, JSON.stringify({ v: VERSION, bundle }));
  } catch {
    // Storage full or unavailable: the app still works online.
  }
}

export async function clearCachedBundles(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(prefix)));
  } catch {
    // Nothing to clear.
  }
}
