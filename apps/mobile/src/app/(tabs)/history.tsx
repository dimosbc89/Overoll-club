import { Redirect } from 'expo-router';

import { LoadError, Loading } from '../../components/RemoteContent';
import { useI18n } from '../../i18n/I18nProvider';
import { useSession } from '../../lib/session';
import { AppScreen } from '../../v2/chrome';
import { HistoryScreen } from '../../v2/screens/HistoryScreen';
import { isV2 } from '../../v2/theme';

/** Points history (v2: its own screen from the Profile; classic: part of the Profile). */
export default function HistoryTab() {
  const { auth, member, refresh } = useSession();
  const { t } = useI18n();
  if (!isV2 || auth.status === 'signed_out' || auth.status === 'not_configured' || member.status === 'none') return <Redirect href="/profile" />;
  if (member.status === 'ready') return <HistoryScreen bundle={member.data} />;
  return <AppScreen title={t('history.title')}>{member.status === 'error' ? <LoadError onRetry={refresh} /> : <Loading />}</AppScreen>;
}
