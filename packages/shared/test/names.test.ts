import { describe, expect, it } from 'vitest';

import { checkName, createCharacterRequestSchema, normalizeName } from '../src/index.js';

describe('Charakternamen', () => {
  it('erlaubt übliche Namen', () => {
    for (const name of ['Kira', 'Vex-9', 'Neo_Runner', 'Jörg Müller', 'Zero.Cool', 'Ana']) {
      expect(checkName(name), name).toBeNull();
    }
  });

  it('nennt den Grund für unzulässige Namen', () => {
    expect(checkName('Al')).toBe('too_short');
    expect(checkName('A'.repeat(21))).toBe('too_long');
    expect(checkName('Kira!')).toBe('invalid_characters');
    expect(checkName('Ki  ra')).toBe('invalid_characters');
    expect(checkName('-Kira')).toBe('invalid_characters');
    expect(checkName('Adm1n')).toBe('blocked');
    expect(checkName('T.B.C.A')).toBe('blocked');
  });

  it('normalisiert für den Vergleich', () => {
    expect(normalizeName('N3o_R-u.n Ä')).toBe('neoruna');
  });

  it('prüft die Anfrage zum Anlegen', () => {
    expect(createCharacterRequestSchema.parse({ name: '  Kira ', classId: 'gunner' })).toEqual({
      name: 'Kira',
      classId: 'gunner',
    });
    expect(createCharacterRequestSchema.safeParse({ name: 'Kira', classId: 'mage' }).success).toBe(
      false,
    );
    const blocked = createCharacterRequestSchema.safeParse({ name: 'Hitler', classId: 'gunner' });
    expect(blocked.error?.issues[0]?.message).toBe('blocked');
  });
});
