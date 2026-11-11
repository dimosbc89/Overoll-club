import { Manrope } from 'next/font/google';
import type { ReactNode } from 'react';

import styles from './console.module.css';

// Gilroy stand-in from the design system (covers Greek), self-hosted by next/font.
const manrope = Manrope({
  subsets: ['latin', 'greek'],
  weight: ['500', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});

/** Full-screen till layout (tablet landscape, 1180×820 in the designs): no back-office header. */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div data-console className={`${manrope.variable} ${styles.root}`}>
      {children}
    </div>
  );
}
