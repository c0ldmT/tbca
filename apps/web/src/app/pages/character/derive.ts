import { deriveSnapshot, type Attributes, type Equipment, type GameConfig } from '@tbca/game-core';
import type { CharacterResponse } from '@tbca/shared';

/** Werte der Kopfzeile in fester Reihenfolge. */
export const HEAD_STATS = [
  'maxHp',
  'damage',
  'armor',
  'firewall',
  'accuracy',
  'evasion',
  'critChance',
  'initiative',
] as const;
export type HeadStat = (typeof HEAD_STATS)[number];

/** Rechnet die Kampfwerte im Browser vor (game-core), z. B. für eine gedachte Ausrüstung. */
export function headStats(
  config: GameConfig,
  c: CharacterResponse,
  equipment: Equipment = c.gear,
  allocated: Attributes = c.allocated,
): Record<HeadStat, number> {
  const s = deriveSnapshot(config, {
    id: c.id,
    name: c.name,
    level: c.level,
    classId: c.classId,
    allocated,
    loadout: { abilities: [], tactics: [] },
    equipment,
  });
  return {
    maxHp: s.stats.maxHp,
    damage: s.attack.base,
    armor: s.stats.armor,
    firewall: s.stats.firewall,
    accuracy: s.stats.accuracy,
    evasion: s.stats.evasion,
    critChance: s.stats.critChance,
    initiative: s.stats.initiative,
  };
}

/** Anzeige eines Werts; Crit-Chance ist in Promille gespeichert und wird als Prozent gezeigt. */
export function formatHeadStat(stat: HeadStat, value: number, locale: string): string {
  if (stat === 'critChance') {
    return (value / 10).toLocaleString(locale, { maximumFractionDigits: 1 });
  }
  return value.toLocaleString(locale);
}
