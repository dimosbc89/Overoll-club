import type { TierId } from '@grow-loyalty/core';

import type { Translate } from '../i18n/messages';

/** Classic / Gold / Club (copy deck §c: names are not translated, but they are settings). */
export function tierName(t: Translate, tier: TierId): string {
  return t(`tiers.${tier}.name`);
}
