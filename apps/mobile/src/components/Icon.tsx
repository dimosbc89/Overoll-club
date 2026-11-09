import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Line icons from the designs (Lucide, ISC licence; the croissant is the
 * Overoll design system's stand-in). Decorative: hidden from screen readers,
 * the text next to them carries the meaning.
 */
export type IconName = 'croissant' | 'card' | 'gift' | 'pin' | 'user' | 'back' | 'check';

export function Icon({
  name,
  size = 24,
  color,
  strokeWidth = 1.5,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
  strokeWidth?: number;
}) {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {name === 'croissant' && (
        <>
          <Path {...stroke} d="M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487" />
          <Path {...stroke} d="M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132" />
          <Path {...stroke} d="M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42" />
          <Path {...stroke} d="M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14" />
          <Path
            {...stroke}
            d="M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676"
          />
        </>
      )}
      {name === 'card' && (
        <>
          <Rect {...stroke} x={3} y={5} width={18} height={14} rx={3} />
          <Path {...stroke} d="M7 10h4M7 14h7" />
        </>
      )}
      {name === 'gift' && (
        <>
          <Rect {...stroke} x={3} y={8} width={18} height={4} rx={1} />
          <Path {...stroke} d="M12 8v13M5 12v9h14v-9M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
        </>
      )}
      {name === 'pin' && (
        <>
          <Path {...stroke} d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <Circle {...stroke} cx={12} cy={9.5} r={2.5} />
        </>
      )}
      {name === 'user' && (
        <>
          <Circle {...stroke} cx={12} cy={8} r={4} />
          <Path {...stroke} d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </>
      )}
      {name === 'back' && <Path {...stroke} d="M15 18l-6-6 6-6" />}
      {name === 'check' && <Path {...stroke} d="M5 12.5l4.5 4.5L19 7.5" />}
    </Svg>
  );
}
