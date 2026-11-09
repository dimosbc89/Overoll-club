import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { SkipLink } from '../components/SkipLink';
import { I18nProvider } from '../i18n/client';
import { translate } from '../i18n/messages';
import './globals.css';

// Static site (Cloudflare Pages): metadata in Greek, the default language; pages set
// the tab title in the chosen language on the client (useDocumentTitle).
export const metadata: Metadata = {
  title: { default: translate('el', 'meta.appTitle'), template: translate('el', 'meta.pageTitle', { page: '%s' }) },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#f5b0b4' };

/**
 * Root: <html>/<body> only. The back office pages get the cocoa header from
 * `(admin)/layout.tsx`; the staff console (`/console`) has its own full-screen
 * till layout.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="el">
      <body>
        <I18nProvider>
          <SkipLink />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
