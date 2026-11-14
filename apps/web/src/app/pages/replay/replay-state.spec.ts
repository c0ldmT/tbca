import { DEMO_FIGHTERS, DEMO_SEED, runDemoBattle } from '../home/demo-battle';
import { buildFrames } from './replay-state';

const teams = DEMO_FIGHTERS.map((f) => [
  {
    id: f.id,
    name: f.name,
    classId: f.classId,
    level: f.level,
    maxHp: f.stats.maxHp,
    energyMax: f.stats.energyMax,
  },
]);

describe('buildFrames', () => {
  const result = runDemoBattle(DEMO_SEED);
  const frames = buildFrames(teams, result.events);

  it('teilt das Log in Abschnitte, ohne Events zu verlieren', () => {
    expect(frames.flatMap((f) => f.events)).toEqual(result.events);
    expect(frames[0]!.events[0]!.type).toBe('start');
    expect(frames.at(-1)!.events.at(-1)!.type).toBe('end');
  });

  it('endet mit den HP aus dem Ergebnis', () => {
    const last = frames.at(-1)!.units;
    for (const f of DEMO_FIGHTERS) {
      const survivor = result.survivors.find((s) => s.id === f.id);
      expect(last[f.id]!.hp, f.id).toBe(survivor?.hp ?? 0);
    }
  });

  it('zeigt Schaden als Zahlen und markiert Treffer', () => {
    const withDamage = frames.find((f) =>
      f.popups.some((p) => p.kind === 'damage' || p.kind === 'crit'),
    )!;
    const target = withDamage.popups[0]!.target;
    expect(withDamage.hit[target]).toBeDefined();
    expect(withDamage.actor).not.toBeNull();
  });

  it('verändert frühere Abschnitte nicht nachträglich', () => {
    const first = frames[0]!.units;
    for (const f of DEMO_FIGHTERS) expect(first[f.id]!.hp).toBe(f.stats.maxHp);
  });
});
