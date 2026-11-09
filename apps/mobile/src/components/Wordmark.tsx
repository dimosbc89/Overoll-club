import { Image } from 'expo-image';

import { useI18n } from '../i18n/I18nProvider';

// Pink wordmark (#ebabc5): place it on cocoa, never on cream or pink.
const source = require('../../assets/overoll-wordmark.svg');

/** Overoll wordmark for headers; aspect ratio from the SVG viewBox (111.582 × 30.137). */
export function Wordmark({ height = 26 }: { height?: number }) {
  const { t } = useI18n();
  return (
    <Image
      source={source}
      style={{ height, width: Math.round((height * 111.582) / 30.137) }}
      contentFit="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('brand.wordmark')}
    />
  );
}
