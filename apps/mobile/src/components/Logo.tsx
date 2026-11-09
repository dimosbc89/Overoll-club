import Svg, { Path } from 'react-native-svg';

import { useI18n } from '../i18n/I18nProvider';
import { colors } from '../theme/tokens';
import * as shapes from './brandPaths';

type Variant = 'logo' | 'wordmark' | 'mark';

/**
 * Overoll logo from assets/brand. Pink (#ebabc5) on cream or white; on a
 * pink field the same shapes in white (`ink="white"`), never pink on pink.
 */
export function Logo({
  variant = 'wordmark',
  ink = 'pink',
  width,
}: {
  variant?: Variant;
  ink?: 'pink' | 'white';
  width: number;
}) {
  const { t } = useI18n();
  const shape = shapes[variant];
  const height = Math.round((width * shape.height) / shape.width);
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('brand.wordmark')}
    >
      {shape.paths.map((d, i) => (
        <Path key={i} d={d} fill={ink === 'white' ? colors.white : colors.pink} />
      ))}
    </Svg>
  );
}
