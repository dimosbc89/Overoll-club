import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { RemoteContent } from '../../components/RemoteContent';
import { Muted, Screen, Title } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import type { Translate } from '../../i18n/messages';
import { fetchStores, type StoreRow } from '../../lib/data';
import { todayHours } from '../../lib/hours';
import { mapsUrl } from '../../lib/maps';
import { localStore } from '../../lib/storeNames';
import { useRemote } from '../../lib/useRemote';
import { type } from '../../theme/fonts';
import { colors, minTouch, radius, space } from '../../theme/tokens';

const shadow = Platform.OS === 'web' ? { boxShadow: '0 1px 2px #48423e14, 0 8px 24px #48423e14' } : { elevation: 2, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } };

function hoursLabel(store: StoreRow, t: Translate, now: Date): string {
  const today = todayHours(store.opening_hours, now, store.time_zone);
  if (today.kind === 'open') return t('stores.today', { open: today.open, close: today.close });
  if (today.kind === 'closed') return t('stores.closedToday');
  return t('stores.hoursUnknown');
}

/** Store list: name, address, today's hours; tap opens the maps app. */
export default function StoresScreen() {
  const { t, locale } = useI18n();
  const { state, reload } = useRemote(fetchStores);
  const now = new Date();

  return (
    <Screen title={t('stores.title')}>
      <Title>{t('stores.title')}</Title>
      <RemoteContent state={state} onRetry={reload}>
        {(stores) =>
          stores.length === 0 ? (
            <Muted>{t('stores.empty')}</Muted>
          ) : (
            <View style={styles.list}>
              {stores.map((row) => {
                // Name and address in the current language (Greek when there is no English yet).
                const store = localStore(row, locale);
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
    padding: space.md,
    gap: 2,
    ...shadow,
  },
  pressed: { backgroundColor: colors.cream },
  name: { ...type.bodyStrong, fontSize: 17, lineHeight: 24 },
  address: { ...type.body, color: colors.inkMuted },
  hours: { ...type.label, color: colors.plumDeep },
});
