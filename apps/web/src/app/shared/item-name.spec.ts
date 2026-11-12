import { humanizeId, itemDisplayName } from './item-name';

const dict: Record<string, string> = { 'items.blade': 'Klinge' };
const t = (key: string) => dict[key] ?? key;

describe('itemDisplayName', () => {
  it('nimmt zuerst den gepflegten Namen der Sprache, dann die andere Sprache', () => {
    expect(
      itemDisplayName('x', { names: { de: 'Falken-Gewehr', en: 'Falcon Rifle' } }, 'en', t),
    ).toBe('Falcon Rifle');
    expect(itemDisplayName('x', { names: { de: 'Falken-Gewehr' } }, 'en', t)).toBe('Falken-Gewehr');
  });

  it('fällt auf die Übersetzung und zuletzt auf die lesbare ID zurück', () => {
    expect(itemDisplayName('blade', undefined, 'de', t)).toBe('Klinge');
    expect(itemDisplayName('new_item_2', {}, 'de', t)).toBe('New Item 2');
    expect(humanizeId('core_implant')).toBe('Core Implant');
  });
});
