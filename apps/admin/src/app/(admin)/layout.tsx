import type { ReactNode } from 'react';

import { Header } from '../../components/Header';

/** Back office pages: cocoa header with navigation and the language switch. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className="page">
        {children}
      </main>
    </>
  );
}
