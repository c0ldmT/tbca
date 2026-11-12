import de from '../../../public/i18n/de.json';
import en from '../../../public/i18n/en.json';

/** Alle Schlüssel eines Übersetzungsbaums in Punktschreibweise. */
function keys(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix];
  return Object.entries(node).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('Übersetzungen', () => {
  it('haben in Deutsch und Englisch dieselben Schlüssel', () => {
    const missingInEn = keys(de).filter((k) => !keys(en).includes(k));
    const missingInDe = keys(en).filter((k) => !keys(de).includes(k));
    expect(missingInEn).toEqual([]);
    expect(missingInDe).toEqual([]);
  });
});
