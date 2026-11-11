import { DEMO_SEED, runDemoBattle, toLogLines } from './demo-battle';

describe('Testkampf', () => {
  it('liefert im Browser denselben Fingerabdruck wie auf dem Server', () => {
    // 35a73d83 wurde in Chromium und in Node berechnet; weicht er ab, ist die Engine nicht
    // mehr deterministisch über Laufzeitumgebungen hinweg.
    expect(runDemoBattle(DEMO_SEED).logHash).toBe('35a73d83');
  });

  it('übersetzt das Event-Log in Zeilen mit Rundenbeginn und Ergebnis', () => {
    const lines = toLogLines(runDemoBattle(DEMO_SEED).events, (n) => n.toFixed(1));
    expect(lines[0]).toEqual({ key: 'battle.round', params: { round: 1 }, tone: 'round' });
    expect(lines.at(-1)?.key).toBe('battle.win');
    expect(lines.some((l) => l.key === 'battle.defeat')).toBe(true);
  });
});
