import type { ReactNode } from 'react';

import { Header } from '../../components/Header';
import { getI18n } from '../../i18n/server';

/** Back office pages: cocoa header with navigation and the language switch. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <>
      <Header locale={locale} t={t} />
      <main id="main" className="page">
        {children}
      </main>
    </>
  );
}
