import AsyncStorage from '@react-native-async-storage/async-storage';

import { brand } from '../brand';
import type { MemberBundle } from './data';
import { createMemberCache } from './memberCache';
import { secretVault } from './secretVault';

/**
 * The member's card cached on the device for offline use (see `memberCache.ts`).
 * Native apps keep the QR secret in the Keychain / Keystore; the web keeps it
 * in the browser's storage. Removed on sign-out.
 */
const cache = createMemberCache({ kv: AsyncStorage, vault: secretVault, prefix: `${brand.slug}.` });

export const loadCachedBundle = (userId: string): Promise<MemberBundle | null> => cache.load(userId);
export const saveCachedBundle = (userId: string, bundle: MemberBundle): Promise<void> => cache.save(userId, bundle);
export const clearCachedBundles = (): Promise<void> => cache.clear();
