import type { ReactNode } from 'react';

import { Header } from '../../components/Header';
import { OfficeProvider } from '../../components/office/OfficeProvider';

/** Back office pages: header with navigation and the language switch, signed-in staff from OfficeProvider. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <OfficeProvider>
      <Header />
      <main id="main" className="page">
        {children}
      </main>
    </OfficeProvider>
  );
}
