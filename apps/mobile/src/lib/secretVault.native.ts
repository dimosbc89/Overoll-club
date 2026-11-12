import * as SecureStore from 'expo-secure-store';

import type { SecretVault } from './memberCache';

/**
 * iOS Keychain / Android Keystore. Readable once the phone has been unlocked
 * after a restart (the card can open from the lock screen shortcut), never
 * copied to backups or to another device.
 */
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const secretVault: SecretVault = {
  get: (key) => SecureStore.getItemAsync(key, options),
  set: (key, value) => SecureStore.setItemAsync(key, value, options),
  remove: (key) => SecureStore.deleteItemAsync(key, options),
};
