import { Platform } from 'react-native';

import { brand } from '../brand';
import { clubUrlSetting } from './env';

/** Program name (copy deck `{programName}`), from the brand (src/brand). */
export const PROGRAM_NAME = brand.programName;

/** Support address (`{supportEmail}`): GROW's test address until the brand's own goes live. */
export const SUPPORT_EMAIL = brand.supportEmail;

/** `{clubUrl}` known at build time: the setting, else the program name. Same in static HTML and in the browser. */
export function clubUrlStatic(): string {
  const setting = clubUrlSetting();
  return setting ? setting.replace(/^https?:\/\//, '').replace(/\/+$/, '') : PROGRAM_NAME;
}

/** `{clubUrl}`: the setting, else (web app, in the browser) the host it runs on, else the program name. */
export function clubUrl(): string {
  if (!clubUrlSetting() && Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.host) {
    return window.location.host;
  }
  return clubUrlStatic();
}
