import el from '../../../../data/copy/push.el.json';
import en from '../../../../data/copy/push.en.json';

export type PushLocale = 'el' | 'en';
export type PushTextKey = keyof typeof el;

/** The push texts (data/copy/push.<locale>.json, copy deck §m). */
export const pushTexts: Readonly<Record<PushLocale, Readonly<Record<PushTextKey, string>>>> = { el, en };

export type PushParams = Readonly<Record<string, string | number>>;

/** Fill `{name}` placeholders; a missing one stays visible rather than silently empty. */
export function fillText(template: string, params: PushParams): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/** The text of one message in the member's language (the title is the program name). */
export function pushText(locale: PushLocale, key: PushTextKey, params: PushParams): string {
  const texts = pushTexts[locale] ?? pushTexts.el;
  return fillText(texts[key], params);
}

/** Points the way people read them in each language: 1.500 in Greek, 1,500 in English. */
export function formatPoints(points: number, locale: PushLocale): string {
  return new Intl.NumberFormat(locale === 'el' ? 'el-GR' : 'en-GB', { maximumFractionDigits: 0 }).format(points);
}
