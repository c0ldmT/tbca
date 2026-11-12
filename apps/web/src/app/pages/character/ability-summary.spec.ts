import { DEFAULT_GAME_CONFIG } from '@tbca/game-core';

import de from '../../../../public/i18n/de.json';
import { describeEffects } from './ability-summary';

const ability = (id: string) => DEFAULT_GAME_CONFIG.abilities.find((a) => a.id === id)!;

describe('describeEffects', () => {
  it('beschreibt Effekte aus den Daten', () => {
    expect(describeEffects(ability('gunner.double_tap'))).toEqual([
      { key: 'effect.damageHits', params: { percent: 85, hits: 2 } },
    ]);
    expect(describeEffects(ability('netrunner.short_circuit'))).toEqual([
      { key: 'effect.damage', params: { percent: 90, hits: 1 } },
      { key: 'effect.stun', params: { chance: 50, turns: 1 } },
    ]);
    expect(describeEffects(ability('bruiser.provoke'))[1]).toEqual({
      key: 'effect.modifier.damageTaken',
      params: { percent: 20, sign: '−', turns: 2 },
    });
  });

  it('hat für jede Fähigkeit und jeden Effekt eine Übersetzung', () => {
    const lookup = (key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], de);
    for (const a of DEFAULT_GAME_CONFIG.abilities) {
      expect(lookup(`abilities.${a.id}`), a.id).toBeTypeOf('string');
      for (const line of describeEffects(a))
        expect(lookup(line.key), line.key).toBeTypeOf('string');
    }
  });
});
