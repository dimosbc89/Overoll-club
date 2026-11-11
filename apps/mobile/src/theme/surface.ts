import { Platform, type ViewStyle } from 'react-native';

import { colors, shape } from './tokens';

/**
 * Raised surfaces (cards, the member card, filled buttons) in the brand's style: a
 * soft shadow (Overoll), or an ink outline with a hard offset "sticker" shadow (Koala).
 */
function shadowOf(offset: number): ViewStyle {
  if (shape.offsetShadow) {
    return Platform.OS === 'web'
      ? ({ boxShadow: `${offset}px ${offset}px 0 ${shape.borderColor}` } as ViewStyle)
      : { shadowColor: shape.borderColor, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: offset, height: offset }, elevation: 3 };
  }
  return Platform.OS === 'web'
    ? ({ boxShadow: '0 1px 2px #48423e14, 0 8px 24px #48423e14' } as ViewStyle)
    : { shadowColor: colors.text, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 };
}

const border: ViewStyle = shape.borderWidth > 0 ? { borderWidth: shape.borderWidth, borderColor: shape.borderColor } : {};

/** Cards and panels. */
export const raised: ViewStyle = { ...border, ...shadowOf(4) };

/** Filled buttons and tags: the outline only, plus a small offset in the sticker style. */
export const control: ViewStyle = shape.offsetShadow ? { ...border, ...shadowOf(2) } : border;
