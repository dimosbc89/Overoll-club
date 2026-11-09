'use client';

import { useDocumentTitle, useI18n } from '../../i18n/client';
import { ConsoleApp } from './ConsoleApp';

/**
 * Staff console (till tablet). Client-side: device sign-in with Supabase Auth,
 * cashier PIN, scan, award, undo, redeem and today's activity. Writes go
 * through the API (`lib/api.ts`), reads through the device session.
 */
export default function ConsolePage() {
  const { locale, t } = useI18n();
  useDocumentTitle(t('console.title'));
  return <ConsoleApp locale={locale} />;
}
