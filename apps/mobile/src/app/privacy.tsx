import { LegalDocument } from '../components/LegalDocument';
import { CloseLink } from '../components/CloseLink';
import { Screen, Title } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { privacy } from '../legal/privacy';

/** Privacy page (`/privacy`): readable without signing in; the App Store and Google Play link to it. */
export default function PrivacyScreen() {
  const { t } = useI18n();
  return (
    <Screen title={t('legal.privacy.title')}>
      <Title>{t('legal.privacy.title')}</Title>
      <LegalDocument template={privacy} />
      <CloseLink />
    </Screen>
  );
}
