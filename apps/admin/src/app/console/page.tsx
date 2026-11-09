import type { Metadata } from 'next';

import { getI18n } from '../../i18n/server';
import { ConsoleApp } from './ConsoleApp';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('console.title') };
}

/**
 * Staff console (till tablet). Client-side: device sign-in with Supabase Auth,
 * cashier PIN, scan, award, undo, redeem and today's activity. Writes go
 * through the API (`lib/api.ts`), reads through the device session.
 */
export default async function ConsolePage() {
  const { locale } = await getI18n();
  return <ConsoleApp locale={locale} />;
}
