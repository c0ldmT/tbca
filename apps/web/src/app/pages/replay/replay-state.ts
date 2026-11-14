import type { BattleEvent, StatusKind } from '@tbca/game-core';
import type { FightCombatantView } from '@tbca/shared';

export interface UnitState {
  hp: number;
  energy: number;
  shield: number;
  statuses: { kind: StatusKind; turns: number }[];
}

export interface Popup {
  target: string;
  text: string;
  kind: 'damage' | 'crit' | 'heal' | 'miss' | 'absorb';
}

/** Ein Abschnitt der Wiedergabe: eine Aktion mit ihren Auswirkungen oder ein Rundenwechsel. */
export interface Frame {
  events: BattleEvent[];
  round: number;
  /** Zustand aller Kämpfer nach diesem Abschnitt. */
  units: Record<string, UnitState>;
  popups: Popup[];
  /** Wer in diesem Abschnitt getroffen wurde (für Treffer-Effekte). */
  hit: Record<string, 'hit' | 'crit'>;
  actor: string | null;
}

const STARTS_FRAME = new Set<BattleEvent['type']>(['start', 'round', 'action', 'stunned', 'end']);

/**
 * Zerlegt das Event-Log in Abschnitte und rechnet den Zustand nach jedem Abschnitt vor.
 * Statusdauern werden wie in der Engine in Zügen des Trägers heruntergezählt; da das Log
 * kein Ablauf-Event enthält, ist die Anzeige dort eine Annäherung.
 */
export function buildFrames(
  teams: FightCombatantView[][],
  events: readonly BattleEvent[],
): Frame[] {
  const units: Record<string, UnitState> = {};
  for (const c of teams.flat()) units[c.id] = { hp: c.maxHp, energy: 0, shield: 0, statuses: [] };

  const groups: BattleEvent[][] = [];
  for (const e of events) {
    if (STARTS_FRAME.has(e.type) || groups.length === 0) groups.push([e]);
    else groups.at(-1)!.push(e);
  }

  let round = 1;
  return groups.map((group) => {
    const popups: Popup[] = [];
    const hit: Record<string, 'hit' | 'crit'> = {};
    let actor: string | null = null;
    for (const e of group) {
      switch (e.type) {
        case 'start':
          for (const c of e.combatants) Object.assign(units[c.id]!, { hp: c.hp, energy: c.energy });
          break;
        case 'round':
          round = e.round;
          break;
        case 'action':
        case 'stunned': {
          const id = e.type === 'action' ? e.source : e.id;
          actor = id;
          const u = units[id]!;
          if (e.type === 'action') u.energy = e.energy;
          u.statuses = u.statuses
            .map((s) => ({ ...s, turns: s.turns - 1 }))
            .filter((s) => s.turns > 0);
          if (!u.statuses.some((s) => s.kind === 'shield')) u.shield = 0;
          break;
        }
        case 'damage': {
          const u = units[e.target]!;
          u.hp = e.hp;
          u.shield = Math.max(0, u.shield - e.absorbed);
          if (u.shield === 0) u.statuses = u.statuses.filter((s) => s.kind !== 'shield');
          if (e.value > 0) {
            popups.push({
              target: e.target,
              text: `−${e.value}`,
              kind: e.crit ? 'crit' : 'damage',
            });
            if (!e.dot) hit[e.target] = e.crit ? 'crit' : (hit[e.target] ?? 'hit');
          } else {
            popups.push({ target: e.target, text: `${e.absorbed}`, kind: 'absorb' });
          }
          break;
        }
        case 'miss':
          popups.push({ target: e.target, text: '–', kind: 'miss' });
          break;
        case 'heal':
          units[e.target]!.hp = e.hp;
          popups.push({ target: e.target, text: `+${e.value}`, kind: 'heal' });
          break;
        case 'status': {
          const u = units[e.target]!;
          u.statuses = [
            ...u.statuses.filter((s) => s.kind !== e.status || e.status === 'dot'),
            { kind: e.status, turns: e.turns },
          ];
          if (e.status === 'shield') u.shield = e.value;
          break;
        }
        case 'energy':
          units[e.target]!.energy = Math.max(0, units[e.target]!.energy - e.value);
          break;
        case 'cleanse': {
          const u = units[e.target]!;
          u.statuses = u.statuses.filter(
            (s) => s.kind !== 'debuff' && s.kind !== 'dot' && s.kind !== 'stun',
          );
          break;
        }
        case 'defeat':
          Object.assign(units[e.id]!, { hp: 0, shield: 0, statuses: [] });
          break;
        default:
          break;
      }
    }
    return { events: group, round, units: structuredClone(units), popups, hit, actor };
  });
}
