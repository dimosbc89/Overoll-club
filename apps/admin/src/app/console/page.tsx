import { defaultConfig } from '@overoll/core';
import type { Metadata } from 'next';

import { getI18n } from '../../i18n/server';
import { formatEuroFromCents } from '../../lib/format';
import { StaffConsole } from './StaffConsole';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('console.title') };
}

/**
 * Staff console (till). Placeholder: no device login, PIN or backend calls
 * yet; scan, award and undo arrive in roadmap week 3.
 */
export default async function ConsolePage() {
  const { t, locale } = await getI18n();
  const maxCents = defaultConfig.limits.maxAmountCents;

  return (
    <>
      <h1>{t('console.title')}</h1>
      <StaffConsole
        locale={locale}
        maxCents={maxCents}
        maxLabel={t('console.maxAmount', { max: formatEuroFromCents(maxCents, locale) })}
      />
    </>
  );
}
