'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import type { Locale, MessageKey, MessageParams, Translate } from '../../i18n/messages';
import type { ConsoleAction } from '../../lib/console/machine';
import type { ProgramConfig } from '@grow-loyalty/core';
import styles from './console.module.css';

/** What every screen gets from the console. */
export interface ScreenContext {
  t: Translate;
  locale: Locale;
  config: ProgramConfig;
  dispatch: (action: ConsoleAction) => void;
  /** Fresh id for a request or an idempotency key. */
  newId: () => string;
  /** Message for an API or sign-in error code. */
  message: (code: string) => string;
}

type Variant = 'filled' | 'outline';
type Size = 'small' | 'normal' | 'tall' | 'huge';

export function Button({
  variant = 'outline',
  size = 'normal',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const classes = [styles.button, styles[variant], size !== 'normal' ? styles[size] : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return <button type="button" {...props} className={classes} />;
}

export interface KeyDef<K extends string> {
  key: K;
  text: ReactNode;
  label?: string;
}

/** Big touch keypad (≥ 64 px keys), 3 columns. */
export function Keypad<K extends string>({
  keys,
  onPress,
  label,
  disabled,
}: {
  keys: readonly KeyDef<K>[];
  onPress: (key: K) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={styles.keypad}>
      {keys.map((k) => (
        <button
          key={k.key}
          type="button"
          className={styles.key}
          aria-label={k.label}
          disabled={disabled}
          onClick={() => onPress(k.key)}
        >
          {k.text}
        </button>
      ))}
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className={styles.alert}>
      {children}
    </p>
  );
}

export function Initial({ name, large }: { name: string; large?: boolean }) {
  return (
    <span className={`${styles.avatar} ${large ? styles.avatarLarge : ''}`} aria-hidden="true">
      {name.trim().charAt(0).toLocaleUpperCase()}
    </span>
  );
}

export function tierLabel(t: Translate, tier: string): string {
  const key = `tier.${tier}` as MessageKey;
  return t(key);
}

/** Translate helper typed for keys built at runtime. */
export function tKey(t: Translate, key: string, params?: MessageParams): string {
  return t(key as MessageKey, params);
}

// ---------------------------------------------------------------- icons (no emoji)

const iconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  viewBox: '0 0 24 24',
};

export function CheckIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function CroissantIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps} strokeWidth={1.8}>
      <path d="M2.5 14.5C3.3 9.6 7.4 6 12 6s8.7 3.6 9.5 8.5c.2 1.2-.8 2.2-2 2l-2.6-.4-1.4 2.4c-.6 1-1.9 1.3-2.8.6l-.7-.8-.7.8c-.9.7-2.2.4-2.8-.6l-1.4-2.4-2.6.4c-1.2.2-2.2-.8-2-2z" />
      <path d="M9 6.6l1.2 9.9M15 6.6l-1.2 9.9M5.2 9.6 7.6 16M18.8 9.6 16.4 16" />
    </svg>
  );
}

export function StarIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps} strokeWidth={1.8}>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

export function GiftIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps} strokeWidth={1.8}>
      <path d="M4 11h16v9H4zM3 7.5h18V11H3zM12 7.5V20" />
      <path d="M12 7.5c-1.5-3-5-3.5-5-1.2 0 1.2 1.4 1.2 5 1.2zM12 7.5c1.5-3 5-3.5 5-1.2 0 1.2-1.4 1.2-5 1.2z" />
    </svg>
  );
}

export function AlertIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps}>
      <path d="M12 7.5v6M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function BackspaceIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps}>
      <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" />
      <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
    </svg>
  );
}
