import { tierOf } from '@tbca/assets';

import { qualityPercent, statValue, tier } from './item-format';

describe('item-format', () => {
  it('zeigt Schaden in Prozent und Crit-Chance in Promille', () => {
    expect(statValue('damageDealt', 15, 'de')).toBe('1,5 %');
    expect(statValue('critChance', 39, 'de')).toBe('39 ‰');
    expect(statValue('maxHp', 1249, 'de')).toBe('1.249');
  });

  it('bildet die Affix-Qualität auf die Balkenbreite ab', () => {
    expect(qualityPercent(1000)).toBe(100);
    expect(qualityPercent(850)).toBe(50);
    // Schlechtester Wurf bleibt als Stück sichtbar
    expect(qualityPercent(700)).toBe(8);
  });

  it('behandelt Rarität 0 wie Rarität 1', () => {
    expect(tier(0)).toBe(tierOf(1));
    expect(tier(16)).toBe(tierOf(16));
  });
});
