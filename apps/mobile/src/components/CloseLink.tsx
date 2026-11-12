import { useRouter } from 'expo-router';

import { useI18n } from '../i18n/I18nProvider';
import { LinkButton } from './ui';

/** "Close" at the end of a page opened from elsewhere (help, terms, privacy): back, or home if opened directly. */
export function CloseLink() {
  const { t } = useI18n();
  const router = useRouter();
  return <LinkButton label={t('common.close')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
