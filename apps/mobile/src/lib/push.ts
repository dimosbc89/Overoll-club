import type { ApiClient } from './api';
import type { PushPermission } from './pushTypes';

export type { PushPermission } from './pushTypes';

/**
 * The web app has no push notifications: these do nothing. The phone version
 * is push.native.ts (Metro picks it for iOS and Android).
 */
export async function pushPermission(): Promise<PushPermission> {
  return 'unavailable';
}

export async function syncPush(_api: ApiClient): Promise<PushPermission> {
  return 'unavailable';
}

export async function enablePush(_api: ApiClient): Promise<PushPermission> {
  return 'unavailable';
}

export async function forgetPush(_api: ApiClient): Promise<void> {}

export function onPushReceived(_listener: () => void): () => void {
  return () => {};
}

export function usePushTaps(_ready: boolean): void {}
