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

import { toLogLines, type LogLine } from '../../shared/battle-log';

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

/** Kampfverlauf des Testkampfs als Logzeilen. */
export function toDemoLogLines(
  events: readonly BattleEvent[],
  formatFactor: (factor: number) => string,
): LogLine[] {
  const name = (id: string) => DEMO_FIGHTERS.find((f) => f.id === id)?.name ?? id;
  const teamName = (team: number) => DEMO_FIGHTERS[team]?.name ?? String(team);
  return toLogLines(events, name, teamName, formatFactor);
}
