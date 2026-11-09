import { Platform } from 'react-native';

import { clubUrlSetting } from './env';

/** Program name setting (copy deck `{programName}`); the final name comes later. */
export const PROGRAM_NAME = 'Overoll Club';

/** Support address for testing (spec §1); Overoll's own address replaces it before launch. */
export const SUPPORT_EMAIL = 'club-support@growagency.online';

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
