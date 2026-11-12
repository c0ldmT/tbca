import { describe, expect, it } from 'vitest';

import { DEFAULT_GAME_CONFIG, itemNames, readableId } from '../src/index.js';

describe('Item-Namen', () => {
  it('nimmt den Namen der Vorlage je Sprache', () => {
    expect(itemNames(DEFAULT_GAME_CONFIG, 'core_implant')).toEqual({
      de: 'Kern-Implantat',
      en: 'Core implant',
    });
  });

  it('fällt auf die andere Sprache, die Startwerte und die ID zurück', () => {
    const c = DEFAULT_GAME_CONFIG;
    const config = {
      ...c,
      items: {
        ...c.items,
        templates: [
          ...c.items.templates.map(({ names: _names, ...t }) => t),
          {
            id: 'neon_whip',
            names: { de: 'Neonpeitsche' },
            category: 'weapon_1h' as const,
            base: {},
            affixPool: [],
          },
        ],
      },
    };
    expect(itemNames(config, 'neon_whip')).toEqual({ de: 'Neonpeitsche', en: 'Neonpeitsche' });
    expect(itemNames(config, 'vest')).toEqual({ de: 'Panzerweste', en: 'Armor vest' });
    expect(itemNames(config, 'old_thing')).toEqual({ de: 'Old thing', en: 'Old thing' });
    expect(readableId('core-implant')).toBe('Core implant');
  });
});
