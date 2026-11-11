import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, localeSchema, meResponseSchema } from '../src/index.js';

describe('geteilte Schemas', () => {
  it('kennt Deutsch und Englisch', () => {
    expect(localeSchema.options).toEqual(['de', 'en']);
    expect(localeSchema.safeParse('fr').success).toBe(false);
    expect(DEFAULT_LOCALE).toBe('de');
  });

  it('prüft die Antwort von /auth/me', () => {
    const valid = {
      account: { id: '01933b5e-6f1a-7c2b-9d3e-4f5a6b7c8d9e', globalRole: 'player', locale: null },
      identities: [{ provider: 'discord', displayName: 'Neo', avatarUrl: null }],
      csrfToken: 'a'.repeat(43),
    };
    expect(meResponseSchema.parse(valid)).toEqual(valid);
    expect(
      meResponseSchema.safeParse({ ...valid, identities: [{ provider: 'myspace' }] }).success,
    ).toBe(false);
  });
});
