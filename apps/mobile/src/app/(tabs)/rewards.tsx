import { StyleSheet, Text, View } from 'react-native';

import { RemoteContent } from '../../components/RemoteContent';
import { Body, Card, Screen, Title } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { fetchRewards } from '../../lib/data';
import { formatPoints } from '../../lib/format';
import { useRemote } from '../../lib/useRemote';
import { fonts } from '../../theme/fonts';
import { colors, space } from '../../theme/tokens';

/** Reward catalog. Costs shown are Classic costs (= base_cost); tier prices come with sign-in. */
export default function RewardsScreen() {
  const { t, locale } = useI18n();
  const { state, reload } = useRemote(fetchRewards);

  return (
    <Screen title={t('rewards.title')}>
      <Title>{t('rewards.title')}</Title>
      <Body>{t('rewards.intro')}</Body>
      <RemoteContent state={state} onRetry={reload}>
        {(rewards) =>
          rewards.length === 0 ? (
            <Body>{t('rewards.empty')}</Body>
          ) : (
            <View style={styles.list}>
              {rewards.map((reward) => {
                const name = locale === 'el' ? reward.name_el : reward.name_en;
                const cost = t('rewards.cost', { points: formatPoints(reward.base_cost, locale) });
                return (
                  <Card key={reward.id} style={styles.row}>
                    <View accessible accessibilityLabel={`${name}, ${cost}`} style={styles.rowInner}>
                      <Text style={styles.name}>{name}</Text>
                      <Text style={styles.cost}>{cost}</Text>
                    </View>
                  </Card>
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
  row: { paddingVertical: space.md },
  rowInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  name: { flex: 1, fontFamily: fonts.sans, fontSize: 17, color: colors.ink },
  cost: { fontFamily: fonts.serif, fontSize: 20, letterSpacing: -0.5, color: colors.cocoa },
});
