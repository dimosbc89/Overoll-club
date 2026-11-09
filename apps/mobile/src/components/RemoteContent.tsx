import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import type { RemoteState } from '../lib/useRemote';
import { type } from '../theme/fonts';
import { colors, space } from '../theme/tokens';
import { Body, Button, Card } from './ui';

export function Loading() {
  const { t } = useI18n();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.plumDeep} accessibilityLabel={t('state.loading')} />
      <Body>{t('state.loading')}</Body>
    </View>
  );
}

/** "The app isn't connected yet": shown everywhere when the Supabase env is missing. */
export function NotConfigured() {
  const { t } = useI18n();
  return (
    <Card style={styles.notice}>
      <Body style={type.bodyStrong}>{t('state.notConfiguredTitle')}</Body>
      <Body>{t('state.notConfiguredBody')}</Body>
    </Card>
  );
}

export function LoadError({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const { t } = useI18n();
  return (
    <Card style={styles.notice}>
      <Body style={type.bodyStrong}>{t('state.errorTitle')}</Body>
      <Body>{message ?? t('state.errorBody')}</Body>
      <Button label={t('state.retry')} variant="outline" size="sm" onPress={onRetry} style={styles.retry} />
    </Card>
  );
}

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
  switch (state.status) {
    case 'ready':
      return <>{children(state.data)}</>;
    case 'loading':
      return <Loading />;
    case 'not_configured':
      return <NotConfigured />;
    case 'error':
      return <LoadError onRetry={onRetry} />;
  }
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  notice: { gap: space.sm, padding: space.mdl },
  retry: { alignSelf: 'flex-start', marginTop: space.xs },
});
