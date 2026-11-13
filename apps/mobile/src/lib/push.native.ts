import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';

import type { ApiClient } from './api';
import { PROGRAM_NAME } from './program';
import type { PushPermission } from './pushTypes';

export type { PushPermission } from './pushTypes';

/**
 * Push notifications on the phone (API v0.9): the phone's permission, its Expo
 * push token sent to the server (`push/register`), forgotten on sign-out, and
 * a tap that opens the tab the message is about. The web app has none
 * (push.ts).
 */

// A message that arrives while the app is open still shows as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const TOKEN_KEY = 'push.token';
const ASKED_KEY = 'push.asked';
const store: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export async function pushPermission(): Promise<PushPermission> {
  if (!Device.isDevice) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

async function phoneToken(): Promise<string | null> {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: PROGRAM_NAME,
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

async function register(api: ApiClient): Promise<void> {
  const token = await phoneToken();
  if (!token) return;
  const result = await api
    .action<{ registered: true }>('push/register', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' })
    .send();
  if (result.ok) await SecureStore.setItemAsync(TOKEN_KEY, token, store);
}

/**
 * After the member's data loads: registers the phone when notifications are
 * allowed (tokens can change, so on every start), and asks the phone's
 * permission once per install. Never throws.
 */
export async function syncPush(api: ApiClient): Promise<PushPermission> {
  try {
    let permission = await pushPermission();
    if (permission === 'undetermined' && !(await SecureStore.getItemAsync(ASKED_KEY, store))) {
      await SecureStore.setItemAsync(ASKED_KEY, '1', store);
      permission = (await Notifications.requestPermissionsAsync()).granted ? 'granted' : 'denied';
    }
    if (permission === 'granted') await register(api);
    return permission;
  } catch (error) {
    if (__DEV__) console.warn('Push registration failed', error);
    return 'unavailable';
  }
}

/** "Turn on notifications" in Profile: asks if it still can, otherwise opens the phone's settings for the app. */
export async function enablePush(api: ApiClient): Promise<PushPermission> {
  try {
    const permission = await pushPermission();
    if (permission === 'denied') {
      const again = await Notifications.requestPermissionsAsync();
      if (!again.granted) {
        await Linking.openSettings();
        return 'denied';
      }
    } else if (permission === 'undetermined') {
      await SecureStore.setItemAsync(ASKED_KEY, '1', store);
      if (!(await Notifications.requestPermissionsAsync()).granted) return 'denied';
    } else if (permission === 'unavailable') {
      return permission;
    }
    await register(api);
    return 'granted';
  } catch (error) {
    if (__DEV__) console.warn('Turning on push failed', error);
    return 'unavailable';
  }
}

/** On sign-out: this phone stops getting the member's messages. Gives up after 3 seconds (offline sign-out). */
export async function forgetPush(api: ApiClient): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY, store).catch(() => null);
  if (!token) return;
  await Promise.race([
    api.action('push/unregister', { token }).send().catch(() => null),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  await SecureStore.deleteItemAsync(TOKEN_KEY, store).catch(() => {});
}

/** Call `listener` when a message arrives while the app is open (the points changed: reload). */
export function onPushReceived(listener: () => void): () => void {
  const subscription = Notifications.addNotificationReceivedListener(() => listener());
  return () => subscription.remove();
}

/** A tap on a message opens its tab: the card, or the rewards. Mounted once in the root layout. */
export function usePushTaps(ready: boolean): void {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const screen = (response.notification.request.content.data as { screen?: string } | undefined)?.screen;
    router.navigate(screen === 'rewards' ? '/rewards' : '/');
  }, [ready, response, router]);
}
