'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import styles from './Header.module.css';

export interface NavItem {
  href: string;
  label: string;
}

/** Header links; labels arrive translated from the server. */
export function Nav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={styles.nav}>
      <ul>
        {items.map((item) => {
          const current = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={current ? 'page' : undefined} className={styles.link}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
