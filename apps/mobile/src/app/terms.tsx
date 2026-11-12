import { LegalDocument } from '../components/LegalDocument';
import { CloseLink } from '../components/CloseLink';
import { Screen, Title } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { terms } from '../legal/terms';

/** Terms page (`/terms`): readable without signing in; the App Store and Google Play link to it. */
export default function TermsScreen() {
  const { t } = useI18n();
  return (
    <Screen title={t('legal.terms.title')}>
      <Title>{t('legal.terms.title')}</Title>
      <LegalDocument template={terms} />
      <CloseLink />
    </Screen>
  );
}
