/**
 * Typed codes at the till (member codes, redemption codes, receipt numbers):
 * a tablet keyboard left in Greek gives Greek capitals that look exactly like
 * Latin ones. These are turned into the Latin letter before a code is
 * compared, so a Greek or a Latin keyboard gives the same text.
 */
const greekToLatin: Readonly<Record<string, string>> = {
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
};

/**
 * Upper-case, accents removed (Ά → Α), Greek capitals that look Latin → Latin
 * (Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ). Other characters are left as they are.
 */
export function latinLookalikes(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, (c) => greekToLatin[c] ?? c);
}

/**
 * A code as typed at the till, ready to compare: `latinLookalikes`, then the
 * separators people put between groups removed (spaces, dashes of any kind,
 * dots), so "abcd-2345", "ABCD 2345" and "ΑΒCD 2345" are all "ABCD2345".
 */
export function cleanTypedCode(raw: string): string {
  return latinLookalikes(raw).replace(/[\s\p{Pd}.·]+/gu, '');
}
