import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { RemoteContent } from '../../components/RemoteContent';
import { useI18n } from '../../i18n/I18nProvider';
import type { Translate } from '../../i18n/messages';
import { fetchStores, type StoreRow } from '../../lib/data';
import { todayHours } from '../../lib/hours';
import { mapsUrl } from '../../lib/maps';
import { localStore } from '../../lib/storeNames';
import { useRemote } from '../../lib/useRemote';
import { AppScreen, TitleRow } from '../chrome';
import { c, radius, raised, space, t } from '../theme';
import { Icon, IconButton, Illo } from '../ui';

function hoursLabel(store: StoreRow, tr: Translate, now: Date): string {
  const today = todayHours(store.opening_hours, now, store.time_zone);
  if (today.kind === 'open') return tr('stores.today', { open: today.open, close: today.close });
  if (today.kind === 'closed') return tr('stores.closedToday');
  return tr('stores.hoursUnknown');
}

/** "+302109765594" → "210 976 5594" (Greek numbers); anything else as it is. */
export function displayPhone(phone: string): string {
  const greek = phone.replace(/\s/g, '').match(/^\+30(\d{3})(\d{3})(\d{4})$/);
  return greek ? `${greek[1]} ${greek[2]} ${greek[3]}` : phone;
}

const looks = [
  { fill: 'sun', art: 'takeaway-cup' },
  { fill: 'mint', art: 'cinnamon-roll' },
] as const;

/** Καταστήματα (Figma App · 07 Stores). */
export function StoresScreen() {
  const { t: tr, locale } = useI18n();
  const { state, reload } = useRemote(fetchStores);
  const now = new Date();

  return (
    <AppScreen title={tr('stores.title')} gap={space[16]}>
      <TitleRow title={tr('stores.title')} />
      <Text style={[t.bodyM, styles.intro]}>{tr('v2.stores.intro')}</Text>
      <RemoteContent state={state} onRetry={reload}>
        {(stores) =>
          stores.length === 0 ? (
            <Text style={t.bodyS}>{tr('stores.empty')}</Text>
          ) : (
            <View style={styles.list}>
              {stores.map((row, i) => {
                const store = localStore(row, locale);
                const look = looks[i % looks.length]!;
                const hours = hoursLabel(store, tr, now);
                return (
                  <View key={store.id} style={styles.card}>
                    <View style={[styles.top, { backgroundColor: look.fill === 'sun' ? c.sun : c.mint }]}>
                      <View style={styles.flex}>
                        <Text accessibilityRole="header" style={t.displayS}>
                          {store.name}
                        </Text>
                        {store.address ? <Text style={t.bodySStrong}>{store.address}</Text> : null}
                      </View>
                      <Illo name={look.art} size={56} style={{ transform: [{ rotate: '8deg' }] }} />
                    </View>
                    <View style={styles.details}>
                      <View style={styles.hours}>
                        <Icon name="clock" size={18} color={c.muted} />
                        <Text style={[t.bodyS, styles.flex]}>{hours}</Text>
                      </View>
                      <View style={styles.actions}>
                        <Text style={[t.bodyMStrong, styles.flex]}>{store.phone ? displayPhone(store.phone) : ''}</Text>
                        {store.phone ? (
                          <IconButton
                            icon="phone"
                            label={tr('v2.stores.call', { store: store.name })}
                            onPress={() => {
                              Linking.openURL(`tel:${store.phone}`).catch(() => {});
                            }}
                          />
                        ) : null}
                        <IconButton
                          icon="directions"
                          tone="white"
                          label={tr('v2.stores.directions', { store: store.name })}
                          onPress={() => {
                            Linking.openURL(mapsUrl(store, Platform.OS)).catch(() => {});
                          }}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )
        }
      </RemoteContent>
      <View style={styles.signoff}>
        <Illo name="steam" size={40} />
        <Text style={[t.hand, styles.flex]}>{tr('v2.stores.signoff')}</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  intro: { marginTop: -space[8] },
  list: { gap: space[16] },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, ...raised(4) },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    padding: space[16],
    borderTopLeftRadius: radius.lg - 2,
    borderTopRightRadius: radius.lg - 2,
  },
  details: { padding: space[16], gap: space[12] },
  hours: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  signoff: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
});
