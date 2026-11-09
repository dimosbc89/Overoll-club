import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { RemoteContent } from '../../components/RemoteContent';
import { Body, Screen, Title } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import type { Translate } from '../../i18n/messages';
import { fetchStores, type StoreRow } from '../../lib/data';
import { todayHours } from '../../lib/hours';
import { mapsUrl } from '../../lib/maps';
import { useRemote } from '../../lib/useRemote';
import { fonts } from '../../theme/fonts';
import { colors, minTouch, radius, space } from '../../theme/tokens';

function hoursLabel(store: StoreRow, t: Translate, now: Date): string {
  const today = todayHours(store.opening_hours, now, store.time_zone);
  if (today.kind === 'open') return t('stores.today', { open: today.open, close: today.close });
  if (today.kind === 'closed') return t('stores.closedToday');
  return t('stores.hoursUnknown');
}

/** Store list: name, address, today's hours; tap opens the maps app. */
export default function StoresScreen() {
  const { t } = useI18n();
  const { state, reload } = useRemote(fetchStores);
  const now = new Date();

  return (
    <Screen title={t('stores.title')}>
      <Title>{t('stores.title')}</Title>
      <RemoteContent state={state} onRetry={reload}>
        {(stores) =>
          stores.length === 0 ? (
            <Body>{t('stores.empty')}</Body>
          ) : (
            <View style={styles.list}>
              {stores.map((store) => {
                const hours = hoursLabel(store, t, now);
                return (
                  <Pressable
                    key={store.id}
                    accessibilityRole="link"
                    accessibilityLabel={[store.name, store.address, hours].filter(Boolean).join(', ')}
                    accessibilityHint={t('stores.openMapsHint')}
                    onPress={() => {
                      Linking.openURL(mapsUrl(store, Platform.OS)).catch(() => {});
                    }}
                    style={({ pressed }) => [styles.store, pressed && styles.pressed]}
                  >
                    <Text style={styles.name}>{store.name}</Text>
                    {store.address ? <Text style={styles.address}>{store.address}</Text> : null}
                    <Text style={styles.hours}>{hours}</Text>
                  </Pressable>
                );
              })}
            </View>
          )
        }
      </RemoteContent>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  store: {
    minHeight: minTouch,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.butter,
    padding: space.md,
    gap: space.xs,
  },
  pressed: { backgroundColor: colors.pinkLight },
  name: { fontFamily: fonts.serif, fontSize: 21, letterSpacing: -0.5, color: colors.cocoa },
  address: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink },
  hours: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '600', color: colors.ink },
});
