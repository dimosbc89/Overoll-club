import { brand } from '../brand';
import el from './el.json';
import en from './en.json';

export const locales = ['el', 'en'] as const;
export type Locale = (typeof locales)[number];

/** Greek first (docs/brand.md, "Voice"). */
export const defaultLocale: Locale = 'el';

/** BCP 47 tags for Intl formatting. */
export const intlLocale: Record<Locale, string> = { el: 'el-GR', en: 'en-GB' };

/** el.json is the reference: every key must exist in every language. */
export type MessageKey = keyof typeof el;
export type Messages = Record<MessageKey, string>;

// Fails to compile if en.json is missing a key from el.json.
const english: Messages = en;

/** The shared texts with this brand's own wording on top (src/brand, same keys; test/brand.test.ts). */
export const messages: Record<Locale, Messages> = {
  el: { ...el, ...brand.copy.el } as Messages,
  en: { ...english, ...brand.copy.en } as Messages,
};

export type MessageParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: MessageParams) => string;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** Message for a key, with `{name}` placeholders filled from params. */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = messages[locale][key] ?? messages[defaultLocale][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * `t()` for one language. `defaults` fill placeholders that are the same
 * everywhere (`{programName}`, `{clubUrl}`, `{supportEmail}`); params win.
 */
export function createTranslate(locale: Locale, defaults?: MessageParams): Translate {
  return (key, params) => translate(locale, key, defaults ? { ...defaults, ...params } : params);
}

/** Keys that come as `<base>.one` / `<base>.other` (copy deck: "keys with .one / .other exist where 1 is likely"). */
export type PluralBase = { [K in MessageKey]: K extends `${infer Base}.other` ? Base : never }[MessageKey];

/** `.one` for exactly 1 when the language file has it, else `.other`. */
export function pluralKey(base: PluralBase, count: number): MessageKey {
  const one = `${base}.one`;
  if (count === 1 && one in messages.el) return one as MessageKey;
  return `${base}.other` as MessageKey;
}
