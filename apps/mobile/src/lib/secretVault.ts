import type { SecretVault } from './memberCache';

/**
 * Web: no encrypted storage in the browser, so the QR secret stays with the
 * rest of the cached card (removed on sign-out). iOS and Android use
 * `secretVault.native.ts` (Keychain / Keystore).
 */
export const secretVault: SecretVault | null = null;
