import {
  DEFAULT_GAME_CONFIG,
  defaultLoadout,
  deriveSnapshot,
  ENGINE_VERSION,
  simulateBattle,
  type BattleEvent,
  type BattleResult,
  type ClassId,
  type CombatantSnapshot,
} from '@tbca/game-core';

function demoFighter(id: string, name: string, classId: ClassId): CombatantSnapshot {
  const level = 12;
  const config = DEFAULT_GAME_CONFIG;
  const primary = config.classes[classId].primary;
  const allocated = { str: 0, dex: 0, int: 0, con: 0 };
  allocated[primary] = 36;
  allocated.con = 24;
  return deriveSnapshot(config, {
    id,
    name,
    level,
    classId,
    allocated,
    loadout: defaultLoadout(config, classId, level),
  });
}

/** Zwei Testkämpfer, abgeleitet aus den echten Klassen und Startwerten. */
export const DEMO_FIGHTERS: readonly CombatantSnapshot[] = [
  demoFighter('kira', 'Kira', 'bruiser'),
  demoFighter('vex', 'Vex', 'netrunner'),
];

export const DEMO_SEED = 'tbca-phase-1';

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
  /** Übersetzungsschlüssel, die vor der Anzeige in Parameter eingesetzt werden. */
  nested?: Record<string, string>;
  tone: 'round' | 'ability' | 'hit' | 'crit' | 'miss' | 'heal' | 'status' | 'defeat' | 'end';
}

export function toLogLines(
  events: readonly BattleEvent[],
  formatFactor: (factor: number) => string,
): LogLine[] {
  const name = (id: string) => DEMO_FIGHTERS.find((f) => f.id === id)?.name ?? id;
  const lines: LogLine[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'start':
        lines.push({ key: 'battle.round', params: { round: 1 }, tone: 'round' });
        break;
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
      case 'action':
        if (e.ability !== 'basic_attack') {
          lines.push({
            key: 'battle.uses',
            params: { source: name(e.source) },
            nested: { ability: `abilities.${e.ability}` },
            tone: 'ability',
          });
        }
        break;
      case 'damage': {
        const params = { source: name(e.source), target: name(e.target), value: e.value };
        if (e.dot) lines.push({ key: 'battle.dot', params, tone: 'hit' });
        else if (e.value === 0) lines.push({ key: 'battle.absorbed', params, tone: 'status' });
        else
          lines.push({
            key: e.crit ? 'battle.crit' : 'battle.hit',
            params,
            tone: e.crit ? 'crit' : 'hit',
          });
        break;
      }
      case 'miss':
        lines.push({
          key: 'battle.miss',
          params: { source: name(e.source), target: name(e.target) },
          tone: 'miss',
        });
        break;
      case 'heal':
        lines.push({
          key: 'battle.heal',
          params: { source: name(e.source), target: name(e.target), value: e.value },
          tone: 'heal',
        });
        break;
      case 'status':
        lines.push({
          key: 'battle.status',
          params: { target: name(e.target), turns: e.turns },
          nested: { status: `battle.statusName.${e.status}` },
          tone: 'status',
        });
        break;
      case 'stunned':
        lines.push({ key: 'battle.stunned', params: { name: name(e.id) }, tone: 'status' });
        break;
      case 'resist':
        lines.push({ key: 'battle.resist', params: { target: name(e.target) }, tone: 'miss' });
        break;
      case 'energy':
        lines.push({
          key: 'battle.drain',
          params: { source: name(e.source), target: name(e.target), value: e.value },
          tone: 'status',
        });
        break;
      case 'cleanse':
        lines.push({ key: 'battle.cleanse', params: { target: name(e.target) }, tone: 'status' });
        break;
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
    }
  }
  return lines;
}
