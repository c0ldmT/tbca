import { describe, expect, it } from 'vitest';

import {
  BattleInputError,
  DEFAULT_BATTLE_RULES,
  ENGINE_VERSION,
  simulateBattle,
  type BattleEvent,
  type BattleInput,
  type CombatantSnapshot,
} from '../src/index.js';
import { deepFreeze, duel, hero, input, teamFight, tweak } from './fixtures.js';

type Ev<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;
const of = <T extends BattleEvent['type']>(events: readonly BattleEvent[], type: T) =>
  events.filter((e): e is Ev<T> => e.type === type);

describe('simulateBattle – Determinismus', () => {
  it('liefert für gleiche Eingaben identische Ergebnisse', () => {
    for (const make of [duel, teamFight]) {
      for (let i = 0; i < 20; i++) {
        expect(simulateBattle(make(`seed-${i}`))).toEqual(simulateBattle(make(`seed-${i}`)));
      }
    }
  });

  it('verändert die Eingabe nicht', () => {
    expect(() => simulateBattle(deepFreeze(teamFight()))).not.toThrow();
  });

  it('ist über eine JSON-Momentaufnahme exakt reproduzierbar', () => {
    const original = simulateBattle(teamFight('replay'));
    const stored = JSON.parse(JSON.stringify(teamFight('replay'))) as BattleInput;
    expect(simulateBattle(stored).events).toEqual(original.events);
  });

  it('erzeugt mit anderen Seeds andere Kampfverläufe', () => {
    const hashes = new Set(Array.from({ length: 20 }, (_, i) => simulateBattle(duel(i)).logHash));
    expect(hashes.size).toBeGreaterThan(15);
  });

  it('hängt nicht von Laufzeitdetails ab (Referenz-Fingerabdrücke)', () => {
    // Ändert sich einer dieser Werte, haben sich Kampflogik oder Startwerte geändert:
    // dann ENGINE_VERSION erhöhen bzw. die Konfiguration versionieren und die Werte bewusst neu setzen.
    expect(simulateBattle(duel('golden-duel')).logHash).toBe('53cba225');
    expect(simulateBattle(teamFight('golden-team')).logHash).toBe('a59d38c1');
  });
});

describe('simulateBattle – Ablauf', () => {
  it('beendet einen Kampf mit Sieger und konsistentem Log', () => {
    const result = simulateBattle(duel('basic'));
    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.reason).toBe('knockout');
    expect(result.events[0]?.type).toBe('start');
    expect(result.events.at(-1)).toMatchObject({ type: 'end', winner: result.winner });
    expect(of(result.events, 'defeat')).toHaveLength(1);
  });

  it('hält HP über Schaden, Schilde und Heilung exakt nach', () => {
    for (let i = 0; i < 10; i++) {
      const { events, survivors } = simulateBattle(teamFight(`hp-${i}`));
      const hp = new Map<string, number>();
      const max = new Map<string, number>();
      for (const c of of(events, 'start')[0]!.combatants) {
        hp.set(c.id, c.hp);
        max.set(c.id, c.hp);
      }
      for (const e of events) {
        if (e.type === 'damage') {
          expect(e.value + e.absorbed).toBeGreaterThan(0);
          expect(e.hp).toBe(hp.get(e.target)! - e.value);
          hp.set(e.target, e.hp);
        } else if (e.type === 'heal') {
          expect(e.hp).toBe(hp.get(e.target)! + e.value);
          expect(e.hp).toBeLessThanOrEqual(max.get(e.target)!);
          hp.set(e.target, e.hp);
        }
      }
      for (const s of survivors) expect(hp.get(s.id)).toBe(s.hp);
    }
  });

  it('nutzt Fähigkeiten aus Taktikregeln und respektiert Energie und Abklingzeit', () => {
    const { events } = simulateBattle(teamFight('abilities'));
    const actions = of(events, 'action');
    expect(new Set(actions.map((a) => a.ability)).size).toBeGreaterThan(4);
    for (const a of actions) expect(a.energy).toBeGreaterThanOrEqual(0);

    // gunner.aimed_shot hat Abklingzeit 3: zwischen zwei Einsätzen liegen mindestens 3 eigene Züge.
    const turns = actions.filter((a) => a.source === 'b-gunner').map((a) => a.ability);
    const uses = turns.flatMap((ability, i) => (ability === 'gunner.aimed_shot' ? [i] : []));
    for (let i = 1; i < uses.length; i++) expect(uses[i]! - uses[i - 1]!).toBeGreaterThan(3);
  });

  it('lässt betäubte Kämpfer aussetzen', () => {
    let stunned = 0;
    for (let i = 0; i < 10; i++) {
      const { events } = simulateBattle(
        input([[hero('net', 'netrunner')], [hero('bru', 'bruiser')]], i),
      );
      for (const s of of(events, 'stunned')) {
        stunned++;
        expect(of(events, 'status').some((st) => st.status === 'stun' && st.target === s.id)).toBe(
          true,
        );
      }
    }
    expect(stunned).toBeGreaterThan(0);
  });

  it('lässt Schaden über Zeit zu Zugbeginn wirken', () => {
    const virus = hero('net', 'netrunner', 10, {
      loadout: {
        abilities: ['netrunner.virus'],
        tactics: [{ when: { type: 'target_lacks_status', status: 'dot' }, use: 'netrunner.virus' }],
      },
    });
    const { events } = simulateBattle(input([[virus], [hero('bru', 'bruiser')]], 'dot'));
    const ticks = of(events, 'damage').filter((d) => d.dot);
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks.every((t) => t.source === 'net' && t.target === 'bru')).toBe(true);
  });

  it('fängt Schaden mit Schilden ab', () => {
    const { events } = simulateBattle(teamFight('shield'));
    expect(of(events, 'damage').some((d) => d.absorbed > 0)).toBe(true);
  });

  it('lässt schnellere Kämpfer öfter handeln', () => {
    const slow = tweak(hero('slow', 'bruiser'), { stats: { maxHp: 20_000, initiative: 100 } });
    const fast = tweak(hero('fast', 'bruiser'), { stats: { maxHp: 20_000, initiative: 200 } });
    const actions = of(simulateBattle(input([[slow], [fast]], 'speed')).events, 'action');
    const ratio =
      actions.filter((a) => a.source === 'fast').length /
      actions.filter((a) => a.source === 'slow').length;
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });

  it('lenkt Angriffe per Provokation auf den Tank', () => {
    // Anteil gegnerischer Treffer auf den Tank, über mehrere Seeds gemittelt. Der Tank hat hier
    // weniger Grundbedrohung als seine Verbündeten, damit nur die Provokation ihn zum Ziel macht.
    const share = (provoke: boolean) => {
      let onTank = 0;
      let total = 0;
      for (let i = 0; i < 12; i++) {
        const fight = teamFight(`taunt-${i}`);
        const tank = tweak(fight.teams[0]![0]!, { stats: { threat: 50 } });
        const tactics = provoke
          ? [{ when: { type: 'always' as const }, use: 'bruiser.provoke', target: 'self' as const }]
          : [];
        const teams = [[{ ...tank, tactics }, ...fight.teams[0]!.slice(1)], fight.teams[1]!];
        const hits = of(simulateBattle({ ...fight, teams }).events, 'damage').filter(
          (d) => d.source.startsWith('b-') && !d.dot,
        );
        onTank += hits.filter((d) => d.target === 'a-tank').length;
        total += hits.length;
      }
      return onTank / total;
    };
    expect(share(true)).toBeGreaterThan(share(false) + 0.1);
  });

  it('wirkt Team-Fähigkeiten auf alle lebenden Verbündeten', () => {
    const { events } = simulateBattle(teamFight('stim'));
    const stim = events.findIndex(
      (e) => e.type === 'action' && e.source === 'a-medic' && e.ability === 'medtech.stim',
    );
    expect(stim).toBeGreaterThanOrEqual(0);
    // Die Auswirkungen folgen direkt auf die Aktion, bis zur nächsten Aktion
    const next = events.findIndex((e, i) => i > stim && e.type === 'action');
    const cleansed = events
      .slice(stim + 1, next < 0 ? undefined : next)
      .filter((e) => e.type === 'cleanse')
      .map((e) => (e as { target: string }).target);
    expect(new Set(cleansed)).toEqual(new Set(['a-tank', 'a-runner', 'a-medic']));
  });

  it('wechselt in den Sudden Death und entscheidet nach maxRounds über den HP-Rest', () => {
    const wall = (id: string, maxHp: number): CombatantSnapshot =>
      tweak(hero(id, 'bruiser', 10, { loadout: { abilities: [], tactics: [] } }), {
        stats: { maxHp, armor: 50_000, firewall: 50_000 },
      });
    const result = simulateBattle({
      ...input([[wall('big', 100_000)], [wall('small', 50_000)]], 'timeout'),
      rules: { ...DEFAULT_BATTLE_RULES, maxRounds: 40 },
    });
    expect(result.reason).toBe('timeout');
    expect(result.rounds).toBe(40);
    expect(result.winner).toBe(0);
    expect(of(result.events, 'sudden_death')[0]).toMatchObject({ round: 30, multiplier: 11_000 });
  });

  it('unterstützt viele gegen einen Boss', () => {
    const boss = tweak(hero('boss', 'bruiser', 20), { stats: { maxHp: 8_000 } });
    const raiders = Array.from({ length: 6 }, (_, i) =>
      hero(`raider-${i}`, (['gunner', 'netrunner', 'medtech'] as const)[i % 3]!),
    );
    const result = simulateBattle(input([raiders, [boss]], 'raid'));
    expect(new Set(of(result.events, 'action').map((a) => a.source)).size).toBe(7);
  });

  it('lehnt ungültige Eingaben ab', () => {
    expect(() => simulateBattle({ ...duel(), engineVersion: ENGINE_VERSION - 1 })).toThrow(
      BattleInputError,
    );
    expect(() => simulateBattle(input([[hero('x', 'gunner')]]))).toThrow(BattleInputError);
    expect(() => simulateBattle(input([[hero('x', 'gunner')], [hero('x', 'gunner')]]))).toThrow(
      /doppelt/,
    );
    const broken = {
      ...hero('x', 'gunner'),
      tactics: [{ when: { type: 'always' as const }, use: 'fehlt' }],
    };
    expect(() => simulateBattle(input([[broken], [hero('y', 'gunner')]]))).toThrow(/Loadout/);
    expect(() =>
      simulateBattle(
        input([[tweak(hero('x', 'gunner'), { stats: { initiative: 0 } })], [hero('y', 'gunner')]]),
      ),
    ).toThrow(/initiative/);
  });
});

describe('simulateBattle – Team-Fokus', () => {
  it('lenkt Angriffe ohne eigene Zielregel auf das Fokusziel', () => {
    const plain = (id: string) =>
      hero(id, 'gunner', 10, { loadout: { abilities: [], tactics: [] } });
    const focused = [
      tweak(plain('a1'), { focus: 'healer' }),
      tweak(plain('a2'), { focus: 'healer' }),
    ];
    const enemies = [hero('tank', 'bruiser'), hero('medic', 'medtech')];
    const { events } = simulateBattle(input([focused, enemies], 'focus'));
    const firstHits = events
      .filter((e) => e.type === 'damage' && e.source.startsWith('a'))
      .slice(0, 4);
    expect(firstHits.every((e) => e.type === 'damage' && e.target === 'medic')).toBe(true);
  });
});
