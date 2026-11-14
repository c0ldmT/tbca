import type { BattleEvent } from '@tbca/game-core';

/** Eine Zeile des Kampfverlaufs als Übersetzungsschlüssel mit Parametern. */
export interface LogLine {
  key: string;
  params: Record<string, string | number>;
  /** Übersetzungsschlüssel, die vor der Anzeige in Parameter eingesetzt werden. */
  nested?: Record<string, string>;
  tone: 'round' | 'ability' | 'hit' | 'crit' | 'miss' | 'heal' | 'status' | 'defeat' | 'end';
}

/** Übersetzt eine Zeile; verschachtelte Schlüssel (Fähigkeit, Status) werden zuerst aufgelöst. */
export function translateLine(
  line: LogLine,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const params: Record<string, string | number> = { ...line.params };
  for (const [param, key] of Object.entries(line.nested ?? {})) params[param] = t(key);
  return t(line.key, params);
}

/**
 * Wandelt ein Event in eine Logzeile um (oder null, wenn es nichts anzuzeigen gibt).
 * `name` löst Kämpfer-IDs in Namen auf, `teamName` den Sieger.
 */
export function toLogLine(
  e: BattleEvent,
  name: (id: string) => string,
  teamName: (team: number) => string,
  formatFactor: (factor: number) => string,
): LogLine | null {
  switch (e.type) {
    case 'start':
      return { key: 'battle.round', params: { round: 1 }, tone: 'round' };
    case 'round':
      return { key: 'battle.round', params: { round: e.round }, tone: 'round' };
    case 'sudden_death':
      return {
        key: 'battle.suddenDeath',
        params: { factor: formatFactor(e.multiplier / 10_000) },
        tone: 'round',
      };
    case 'action':
      return e.ability === 'basic_attack'
        ? null
        : {
            key: 'battle.uses',
            params: { source: name(e.source) },
            nested: { ability: `abilities.${e.ability}` },
            tone: 'ability',
          };
    case 'damage': {
      const params = { source: name(e.source), target: name(e.target), value: e.value };
      if (e.dot) return { key: 'battle.dot', params, tone: 'hit' };
      if (e.value === 0) return { key: 'battle.absorbed', params, tone: 'status' };
      return { key: e.crit ? 'battle.crit' : 'battle.hit', params, tone: e.crit ? 'crit' : 'hit' };
    }
    case 'miss':
      return {
        key: 'battle.miss',
        params: { source: name(e.source), target: name(e.target) },
        tone: 'miss',
      };
    case 'heal':
      return {
        key: 'battle.heal',
        params: { source: name(e.source), target: name(e.target), value: e.value },
        tone: 'heal',
      };
    case 'status':
      return {
        key: 'battle.status',
        params: { target: name(e.target), turns: e.turns },
        nested: { status: `battle.statusName.${e.status}` },
        tone: 'status',
      };
    case 'stunned':
      return { key: 'battle.stunned', params: { name: name(e.id) }, tone: 'status' };
    case 'resist':
      return { key: 'battle.resist', params: { target: name(e.target) }, tone: 'miss' };
    case 'energy':
      return {
        key: 'battle.drain',
        params: { source: name(e.source), target: name(e.target), value: e.value },
        tone: 'status',
      };
    case 'cleanse':
      return { key: 'battle.cleanse', params: { target: name(e.target) }, tone: 'status' };
    case 'defeat':
      return { key: 'battle.defeat', params: { name: name(e.id) }, tone: 'defeat' };
    case 'end':
      return e.winner === null
        ? { key: 'battle.draw', params: { rounds: e.round }, tone: 'end' }
        : { key: 'battle.win', params: { name: teamName(e.winner), rounds: e.round }, tone: 'end' };
  }
}

export function toLogLines(
  events: readonly BattleEvent[],
  name: (id: string) => string,
  teamName: (team: number) => string,
  formatFactor: (factor: number) => string,
): LogLine[] {
  return events.flatMap((e) => toLogLine(e, name, teamName, formatFactor) ?? []);
}
