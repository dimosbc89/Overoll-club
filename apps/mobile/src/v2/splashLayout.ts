/**
 * Geometry of the opening screen (Figma "Koala Club — loyalty app concept",
 * Onboarding → 01 Splash). The design is drawn on a 390 × 844 phone; the app scales
 * that frame to fit the screen and centres it, so the composition never crops.
 */
export const splashFrame = { width: 390, height: 844 } as const;

/** The logo mark in the frame: 150 high, centred horizontally, its centre at y 345.79. */
export const splashMark = { height: 150, top: 270.79 } as const;

/**
 * Width of the mark on the native splash (expo-splash-screen `imageWidth` in
 * app.config.ts, test/app-config.test.ts keeps them equal): the native splash shows
 * the mark this wide at the centre of the screen, and the opening animation starts
 * from exactly there.
 */
export const nativeSplashMarkWidth = 160;

/** Decorations of 01 Splash: box and tilt in frame units (Figma inner box of each illustration). */
export const splashDecos = [
  { name: 'eucalyptus-light', left: 4.67, top: 71.28, size: 150, rotate: -25 },
  { name: 'confetti', left: 168, top: 112, size: 96, rotate: 0 },
  { name: 'sparkle', left: 304.44, top: 134.72, size: 56, rotate: -10 },
  { name: 'squiggle', left: 40, top: 520, size: 90, rotate: 0 },
  { name: 'takeaway-cup', left: 258.67, top: 569.51, size: 120, rotate: 10 },
  { name: 'croissant', left: 2.36, top: 603.89, size: 110, rotate: -15 },
] as const;

export interface SplashLayout {
  /** Scale of the 390 × 844 frame on this screen. */
  scale: number;
  /** Position of the unscaled frame, so that scaling about its centre fits it to the screen. */
  left: number;
  top: number;
  /** Where the mark starts (the native splash's place and size), relative to its place in the design. */
  markStart: { translateY: number; scale: number };
}

/**
 * @param markAspect the mark's width / height (brand.logo.mark)
 */
export function splashLayout(screenWidth: number, screenHeight: number, markAspect: number): SplashLayout {
  const scale = Math.min(screenWidth / splashFrame.width, screenHeight / splashFrame.height);
  const markCentre = splashMark.top + splashMark.height / 2;
  const markWidth = splashMark.height * markAspect * scale;
  return {
    scale,
    left: (screenWidth - splashFrame.width) / 2,
    top: (screenHeight - splashFrame.height) / 2,
    // Frame units: the frame is scaled about its centre, which sits on the screen's centre.
    markStart: { translateY: splashFrame.height / 2 - markCentre, scale: markWidth > 0 ? nativeSplashMarkWidth / markWidth : 1 },
  };
}
