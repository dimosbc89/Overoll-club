import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { brand, type LogoShape } from '../brand';
import { useI18n } from '../i18n/I18nProvider';
import { displayFont } from '../theme/fonts';
import { colors } from '../theme/tokens';

type Variant = 'logo' | 'wordmark' | 'mark';

function Shape({ shape, width, color, label }: { shape: LogoShape; width: number; color: string; label?: string }) {
  const height = Math.round((width * shape.height) / shape.width);
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`${shape.x ?? 0} ${shape.y ?? 0} ${shape.width} ${shape.height}`}
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'auto' : 'no-hide-descendants'}
    >
      {shape.paths.map((d, i) => (
        <Path key={i} d={d} fill={color} fillRule={shape.evenOdd || shape.evenOddPaths?.includes(i) ? 'evenodd' : 'nonzero'} />
      ))}
    </Svg>
  );
}

/**
 * The brand's logo (src/brand). On the page background it takes the brand's logo
 * colour; `onHeader` gives the colour that works on the header. A brand without its
 * own wordmark shows its mark next to the brand name set in the display font.
 */
export function Logo({ variant = 'wordmark', onHeader = false, width }: { variant?: Variant; onHeader?: boolean; width: number }) {
  const { t } = useI18n();
  const color = onHeader ? colors.logoOnHeader : colors.logo;
  const label = t('brand.wordmark');
  const { mark, wordmark, full } = brand.logo;
  const own = variant === 'mark' ? mark : variant === 'logo' ? (full ?? wordmark) : wordmark;
  const scaled = own && own !== mark && own !== full ? Math.round(width * (brand.logo.widthScale ?? 1)) : width;
  if (own) return <Shape shape={own} width={scaled} color={color} label={label} />;

  // Mark + text: the mark at about a third of the width, the name filling the rest.
  const markWidth = Math.round(width * (variant === 'logo' ? 0.42 : 0.3));
  const fontSize = Math.max(14, Math.round(width * (variant === 'logo' ? 0.17 : 0.16)));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ flexDirection: variant === 'logo' ? 'column' : 'row', alignItems: 'center', gap: Math.round(fontSize / 3) }}
    >
      <Shape shape={mark} width={markWidth} color={color} />
      <Text style={{ ...displayFont(800), fontSize, lineHeight: Math.round(fontSize * 1.15), color }}>{brand.logo.wordmarkText}</Text>
    </View>
  );
}
