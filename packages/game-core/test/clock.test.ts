import { describe, expect, it } from 'vitest';

import { GameClock, ManualTimeSource, TimerQueue } from '../src/index.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function setup(factor = 1) {
  const real = new ManualTimeSource(1_000_000);
  const clock = new GameClock({ source: real.read, factor, start: 0 });
  return { real, clock };
}

describe('GameClock', () => {
  it('läuft ohne Zeitfaktor synchron zur Echtzeit', () => {
    const { real, clock } = setup();
    expect(clock.now()).toBe(0);
    real.tick(1500);
    expect(clock.now()).toBe(1500);
  });

  it('beschleunigt mit Zeitfaktor (1 Spieltag = 1 Stunde)', () => {
    const { real, clock } = setup(24);
    real.tick(HOUR);
    expect(clock.now()).toBe(DAY);
    expect(clock.toRealDelay(DAY)).toBe(HOUR);
    expect(clock.toRealDelay(1)).toBe(1); // nie zu früh auslösen
  });

  it('springt beim Ändern des Zeitfaktors nicht', () => {
    const { real, clock } = setup(2);
    real.tick(1000);
    expect(clock.now()).toBe(2000);
    clock.setFactor(10);
    expect(clock.now()).toBe(2000);
    real.tick(1000);
    expect(clock.now()).toBe(12_000);
    expect(clock.getFactor()).toBe(10);
  });

  it('spult vor, aber nie zurück', () => {
    const { real, clock } = setup();
    clock.advance(DAY);
    expect(clock.now()).toBe(DAY);
    real.tick(10);
    expect(clock.now()).toBe(DAY + 10);
    clock.advanceTo(2 * DAY);
    expect(clock.now()).toBe(2 * DAY);
    expect(() => clock.advanceTo(DAY)).toThrow(RangeError);
    expect(() => clock.advance(-1)).toThrow(RangeError);
  });

  it('lehnt ungültige Zeitfaktoren ab', () => {
    expect(() => new GameClock({ factor: 0 })).toThrow(RangeError);
    expect(() => setup().clock.setFactor(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('nutzt ohne Angaben die Systemuhr', () => {
    const clock = new GameClock();
    expect(Math.abs(clock.now() - Date.now())).toBeLessThan(1000);
  });
});

describe('TimerQueue und fastForward', () => {
  it('sortiert nach Fälligkeit, bei Gleichstand nach Einplanung', () => {
    const q = new TimerQueue<string>();
    q.schedule(30, 'c');
    q.schedule(10, 'a1');
    q.schedule(20, 'b');
    q.schedule(10, 'a2');
    expect(q.takeDue(20).map((t) => t.payload)).toEqual(['a1', 'a2', 'b']);
    expect(q.size).toBe(1);
  });

  it('arbeitet beim Vorspulen alle fälligen Jobs in Reihenfolge und zur richtigen Zeit ab', async () => {
    const { clock } = setup();
    const q = new TimerQueue<string>();
    q.schedule(DAY, 'tages-reset');
    q.schedule(20 * HOUR, 'spieltag');
    q.schedule(3 * DAY, 'season-ende');

    const seen: Array<[string, number]> = [];
    const executed = await clock.fastForward(2 * DAY, q, (timer) => {
      seen.push([timer.payload, clock.now()]);
      // Wiederkehrender Job plant sich neu ein.
      if (timer.payload === 'tages-reset') q.schedule(timer.at + DAY, 'tages-reset');
    });

    expect(executed).toBe(3);
    expect(seen).toEqual([
      ['spieltag', 20 * HOUR],
      ['tages-reset', DAY],
      ['tages-reset', 2 * DAY],
    ]);
    expect(clock.now()).toBe(2 * DAY);
    // Beide um 3 Tage fällig: das Season-Ende wurde zuerst eingeplant.
    expect(q.peek()?.payload).toBe('season-ende');
    expect(q.cancel(q.peek()!.id)).toBe(true);
    expect(q.peek()?.payload).toBe('tages-reset');
  });
});
