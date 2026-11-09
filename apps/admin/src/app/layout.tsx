import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { getI18n } from '../i18n/server';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t('meta.appTitle'), template: t('meta.pageTitle', { page: '%s' }) },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { themeColor: '#f5b0b4' };

/**
 * Root: <html>/<body> only. The back office pages get the cocoa header from
 * `(admin)/layout.tsx`; the staff console (`/console`) has its own full-screen
 * till layout.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale}>
      <body>
        <a href="#main" className="skip-link">
          {t('nav.skip')}
        </a>
        {children}
      </body>
    </html>
  );
}
