import {
  ENGINE_VERSION,
  simulateBattle,
  type BattleEvent,
  type BattleResult,
  type CombatantSnapshot,
} from '@tbca/game-core';

/** Zwei feste Testkämpfer; Werte wie die Startwerte der Spezifikation. */
export const DEMO_FIGHTERS: readonly CombatantSnapshot[] = [
  {
    id: 'kira',
    name: 'Kira',
    level: 12,
    stats: {
      maxHp: 540,
      armor: 170,
      firewall: 80,
      initiative: 100,
      accuracy: 60,
      evasion: 35,
      critChance: 90,
      critDamage: 15_000,
      threat: 140,
    },
    attack: { kind: 'physical', base: 32, attribute: 44, scaling: 5_000 },
  },
  {
    id: 'vex',
    name: 'Vex',
    level: 12,
    stats: {
      maxHp: 420,
      armor: 110,
      firewall: 90,
      initiative: 132,
      accuracy: 72,
      evasion: 52,
      critChance: 210,
      critDamage: 16_000,
    },
    attack: { kind: 'physical', base: 26, attribute: 50, scaling: 5_000 },
  },
];

export const DEMO_SEED = 'tbca-phase-0';

export function runDemoBattle(seed: string): BattleResult {
  return simulateBattle({
    engineVersion: ENGINE_VERSION,
    configVersion: 1,
    seed,
    teams: [[DEMO_FIGHTERS[0]!], [DEMO_FIGHTERS[1]!]],
  });
}

/** Eine Zeile des Kampfverlaufs als Übersetzungsschlüssel mit Parametern. */
export interface LogLine {
  key: string;
  params: Record<string, string | number>;
  tone: 'round' | 'hit' | 'crit' | 'miss' | 'defeat' | 'end';
}

export function toLogLines(
  events: readonly BattleEvent[],
  formatFactor: (factor: number) => string,
): LogLine[] {
  const name = (id: string) => DEMO_FIGHTERS.find((f) => f.id === id)?.name ?? id;
  const lines: LogLine[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'round':
        lines.push({ key: 'battle.round', params: { round: e.round }, tone: 'round' });
        break;
      case 'sudden_death':
        lines.push({
          key: 'battle.suddenDeath',
          params: { factor: formatFactor(e.multiplier / 10_000) },
          tone: 'round',
        });
        break;
      case 'action': {
        const params = { source: name(e.source), target: name(e.target), value: e.value };
        if (e.outcome === 'miss') lines.push({ key: 'battle.miss', params, tone: 'miss' });
        else if (e.effects.includes('crit'))
          lines.push({ key: 'battle.crit', params, tone: 'crit' });
        else lines.push({ key: 'battle.hit', params, tone: 'hit' });
        break;
      }
      case 'defeat':
        lines.push({ key: 'battle.defeat', params: { name: name(e.id) }, tone: 'defeat' });
        break;
      case 'end': {
        const winner = e.winner === null ? null : DEMO_FIGHTERS[e.winner];
        lines.push(
          winner
            ? { key: 'battle.win', params: { name: winner.name, rounds: e.round }, tone: 'end' }
            : { key: 'battle.draw', params: { rounds: e.round }, tone: 'end' },
        );
        break;
      }
      case 'start':
        lines.push({ key: 'battle.round', params: { round: 1 }, tone: 'round' });
        break;
    }
  }
  return lines;
}
