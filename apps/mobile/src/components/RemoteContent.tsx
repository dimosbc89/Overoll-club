import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import type { RemoteState } from '../lib/useRemote';
import { colors, space } from '../theme/tokens';
import { Body, Button, Card } from './ui';

/** Loading / not configured / error states around data read from Supabase. */
export function RemoteContent<T>({
  state,
  onRetry,
  children,
}: {
  state: RemoteState<T>;
  onRetry: () => void;
  children: (data: T) => ReactNode;
}) {
  const { t } = useI18n();

  switch (state.status) {
    case 'ready':
      return <>{children(state.data)}</>;
    case 'loading':
      return (
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.cocoa} accessibilityLabel={t('state.loading')} />
          <Body>{t('state.loading')}</Body>
        </View>
      );
    case 'not_configured':
      return (
        <Card style={styles.notice}>
          <Body style={styles.noticeTitle}>{t('state.notConfiguredTitle')}</Body>
          <Body>{t('state.notConfiguredBody')}</Body>
        </Card>
      );
    case 'error':
      return (
        <Card style={styles.notice}>
          <Body style={styles.noticeTitle}>{t('state.errorTitle')}</Body>
          <Body>{t('state.errorBody')}</Body>
          <Button label={t('state.retry')} variant="secondary" onPress={onRetry} style={styles.retry} />
        </Card>
      );
  }
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  notice: { backgroundColor: colors.butter, borderColor: colors.butter, gap: space.sm },
  noticeTitle: { fontWeight: '700', color: colors.cocoa },
  retry: { alignSelf: 'flex-start', marginTop: space.xs },
});
