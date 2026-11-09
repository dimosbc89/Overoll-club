import { describe, expect, it, vi } from 'vitest';

import { ActionSlot, ApiClient } from '../src/lib/api';
import { confirmWordMatches, deleteOutcome } from '../src/lib/deleteAccount';
import { apiBaseUrl } from '../src/lib/env';
import { inLocale, localStore } from '../src/lib/storeNames';
import { translate } from '../src/i18n/messages';

const words = [translate('el', 'delete.confirmWord'), translate('en', 'delete.confirmWord')];

describe('delete account: confirmation word (copy deck §b6)', () => {
  it('takes ΔΙΑΓΡΑΦΗ or DELETE, in any case, with or without accents', () => {
    expect(words).toEqual(['ΔΙΑΓΡΑΦΗ', 'DELETE']);
    for (const typed of ['ΔΙΑΓΡΑΦΗ', 'διαγραφή', ' Διαγραφη ', 'DELETE', 'delete']) {
      expect(confirmWordMatches(typed, words), typed).toBe(true);
    }
  });

  it('refuses anything else', () => {
    for (const typed of ['', '   ', 'ΔΙΑΓΡΑΦ', 'DELET', 'delete me', 'ΔΙΑΓΡΑΦΗ DELETE']) {
      expect(confirmWordMatches(typed, words), typed).toBe(false);
    }
  });
});

describe('delete account: what the answer means', () => {
  it('a success is done; errors are shown, with "try again" when the request may not have arrived', () => {
    expect(deleteOutcome({ ok: true }, false)).toBe('deleted');
    expect(deleteOutcome({ ok: false, code: 'network_error' }, false)).toBe('retry');
    expect(deleteOutcome({ ok: false, code: 'internal_error' }, false)).toBe('retry');
    expect(deleteOutcome({ ok: false, code: 'forbidden' }, false)).toBe('error');
    expect(deleteOutcome({ ok: false, code: 'unauthenticated' }, false)).toBe('error');
  });

  it('after an unclear attempt, a session that is gone means the account was deleted', () => {
    expect(deleteOutcome({ ok: false, code: 'unauthenticated' }, true)).toBe('deleted');
    expect(deleteOutcome({ ok: false, code: 'forbidden' }, true)).toBe('error');
  });

  it('posts account/delete with confirm and reuses the key when tapped again after an error', async () => {
    const bodies: Record<string, unknown>[] = [];
    const answers = [
      () => Promise.reject(new TypeError('offline')),
      () => Promise.resolve(new Response(JSON.stringify({ ok: true, memberIds: ['m'], codesCancelled: 0, authUserDeleted: true }), { status: 200 })),
    ];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://example.supabase.co/functions/v1/api/account/delete');
      bodies.push(JSON.parse(String(init?.body)));
      return answers.shift()!();
    }) as unknown as typeof fetch;
    let n = 0;
    const api = new ApiClient({
      baseUrl: apiBaseUrl('https://example.supabase.co/'),
      getAccessToken: async () => 'token',
      newKey: () => `key-${++n}`,
      fetchImpl,
    });
    const slot = new ActionSlot<{ memberIds: string[] }>(() => api);
    expect(await slot.send('account/delete', { confirm: true })).toEqual({ ok: false, code: 'network_error' });
    expect(await slot.send('account/delete', { confirm: true })).toMatchObject({ ok: true, data: { memberIds: ['m'] } });
    expect(bodies).toEqual([
      { confirm: true, idempotencyKey: 'key-1' },
      { confirm: true, idempotencyKey: 'key-1' },
    ]);
  });
});

describe('store names in the current language (v0.4)', () => {
  const store = {
    id: 's',
    name: 'Overoll Χαλάνδρι',
    name_en: 'Overoll Chalandri',
    address: 'Κατσουλιέρη 10, 152 33 Χαλάνδρι',
    address_en: 'Katsoulieri 10, 152 33 Chalandri',
  };

  it('shows English in English and falls back to Greek', () => {
    expect(localStore(store, 'en')).toMatchObject({ name: 'Overoll Chalandri', address: 'Katsoulieri 10, 152 33 Chalandri' });
    expect(localStore(store, 'el')).toMatchObject({ name: 'Overoll Χαλάνδρι', address: 'Κατσουλιέρη 10, 152 33 Χαλάνδρι' });
    expect(localStore({ ...store, name_en: null, address_en: null }, 'en')).toMatchObject({ name: 'Overoll Χαλάνδρι' });
    expect(localStore({ ...store, address: null }, 'en').address).toBeNull();
    expect(inLocale('Overoll Χαλάνδρι', '', 'en')).toBe('Overoll Χαλάνδρι');
    expect(inLocale('Overoll Χαλάνδρι', undefined, 'en')).toBe('Overoll Χαλάνδρι');
  });
});
