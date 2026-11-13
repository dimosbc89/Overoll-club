import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import { brand } from '../brand';
import { useI18n } from '../i18n/I18nProvider';
import { useSession } from '../lib/session';
import { splashDecos, splashFrame, splashLayout, splashMark } from './splashLayout';
import { c, isV2, t } from './theme';
import { Illo, LogoMark, Sticker } from './ui';

/** On screen at least this long (the opening takes ~0.7 s), at most this long even if the card is still loading. */
const MIN_MS = 1600;
const MAX_MS = 3500;
const FADE_MS = 280;

/**
 * Opening screen of the v2 apps (Figma 01 Splash: brand green, the mark, «koala
 * coffee», the Club sticker, the illustrations and the tagline). The native splash
 * (expo-splash-screen) shows only the mark on the same green; this screen takes over
 * from it with the mark in the same place and size, moves it to its place in the
 * design while the rest appears, waits for the session, then fades out.
 * Native apps only: the web app opens straight onto its page.
 */
export function Splash() {
  if (Platform.OS === 'web' || !isV2) return null;
  return <SplashOverlay />;
}

function SplashOverlay() {
  const { t: tr } = useI18n();
  const { auth, member } = useSession();
  // The window size draws the first frame; the overlay's own size (onLayout) then wins,
  // since it is the area actually covered (e.g. without Android's navigation bar).
  const win = useWindowDimensions();
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const size = measured ?? win;
  const layout = splashLayout(size.width, size.height, brand.logo.mark.width / brand.logo.mark.height);

  const intro = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [minDone, setMinDone] = useState(false);
  const [maxDone, setMaxDone] = useState(false);
  const [gone, setGone] = useState(false);
  const loaded = auth.status !== 'loading' && member.status !== 'loading';
  const leave = minDone && (loaded || maxDone);

  useEffect(() => {
    let cancelled = false;
    const play = (reduceMotion: boolean) => {
      if (cancelled) return;
      if (reduceMotion) intro.setValue(1);
      else Animated.timing(intro, { toValue: 1, duration: 650, delay: 100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    };
    AccessibilityInfo.isReduceMotionEnabled().then(play, () => play(true));
    const min = setTimeout(() => setMinDone(true), MIN_MS);
    const max = setTimeout(() => setMaxDone(true), MAX_MS);
    return () => {
      cancelled = true;
      clearTimeout(min);
      clearTimeout(max);
    };
  }, [intro]);

  useEffect(() => {
    if (!leave) return;
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setGone(true));
  }, [leave, fade]);

  if (gone) return null;

  const markTranslateY = intro.interpolate({ inputRange: [0, 1], outputRange: [layout.markStart.translateY, 0] });
  const markScale = intro.interpolate({ inputRange: [0, 1], outputRange: [layout.markStart.scale, 1] });
  // Everything else appears in the second half of the move, with a small pop.
  const appear = intro.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0, 1] });
  const pop = intro.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.6, 0.6, 1] });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}
      pointerEvents={leave ? 'none' : 'auto'}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0 && (width !== measured?.width || height !== measured?.height)) setMeasured({ width, height });
      }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={brand.programName}
    >
      <StatusBar style="light" />
      {size.width > 0 && size.height > 0 ? (
        <View
          style={[styles.frame, { left: layout.left, top: layout.top, transform: [{ scale: layout.scale }] }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {splashDecos.map((d) => (
            <Animated.View
              key={d.name}
              style={{ position: 'absolute', left: d.left, top: d.top, opacity: appear, transform: [{ rotate: `${d.rotate}deg` }, { scale: pop }] }}
            >
              <Illo name={d.name} size={d.size} />
            </Animated.View>
          ))}
          <View style={styles.brand}>
            <Animated.View style={{ transform: [{ translateY: markTranslateY }, { scale: markScale }] }}>
              <LogoMark height={splashMark.height} color={c.onBrandSoft} />
            </Animated.View>
            <Animated.Text style={[t.displayL, styles.wordmark, { opacity: appear }]}>{brand.logo.wordmarkText}</Animated.Text>
            {/* Figma: 20 below the wordmark to the sticker instance, whose own padding is 8 (ours is 6). */}
            <Animated.View style={{ marginTop: 22, opacity: appear, transform: [{ scale: pop }] }}>
              <Sticker label={tr('v2.splash.sticker')} color="sun" rotate={6} style={styles.sticker} />
            </Animated.View>
          </View>
          <Animated.Text style={[t.hand, styles.tagline, { opacity: appear }]}>{tr('v2.splash.tagline')}</Animated.Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: c.brand, zIndex: 100, elevation: 100 },
  frame: { position: 'absolute', width: splashFrame.width, height: splashFrame.height },
  brand: { position: 'absolute', left: 0, right: 0, top: splashMark.top, alignItems: 'center' },
  wordmark: { marginTop: 10, color: c.onBrandSoft },
  sticker: { alignSelf: 'center' },
  tagline: { position: 'absolute', left: 16, right: 16, top: 766, textAlign: 'center', color: c.onBrandSoft },
});
