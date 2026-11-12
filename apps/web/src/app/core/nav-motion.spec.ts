import { playNavMotion, tabDirection, transitionKind } from './nav-motion';

describe('transitionKind', () => {
  it('erkennt Tab-Wechsel im selben Hub', () => {
    expect(transitionKind('/character/gear', '/character/workshop')).toBe('tab');
    expect(transitionKind('/fight/arena', '/fight/history')).toBe('tab');
  });

  it('erkennt Hub-Wechsel', () => {
    expect(transitionKind('/character/gear', '/fight/arena')).toBe('hub');
    expect(transitionKind('/', '/character/gear')).toBe('hub');
    expect(transitionKind('/', '/')).toBe('hub');
  });
});

describe('tabDirection', () => {
  const tabs = ['/fight/arena', '/fight/dungeon', '/fight/training'];
  it('liest die Richtung aus der Tab-Reihenfolge', () => {
    expect(tabDirection(tabs, '/fight/arena', '/fight/training')).toBe('next');
    expect(tabDirection(tabs, '/fight/training', '/fight/dungeon')).toBe('prev');
  });
});

describe('playNavMotion', () => {
  it('setzt die Attribute und räumt sie nach der Bewegung wieder ab', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const id = playNavMotion(root, 'tab', 'prev', window, undefined);
    expect(root.dataset['nav']).toBe('tab');
    expect(root.dataset['navDir']).toBe('prev');
    // Ein zweiter Wechsel beginnt von vorn und hebt den alten Timer auf
    playNavMotion(root, 'hub', 'next', window, id);
    expect(root.dataset['nav']).toBe('hub');
    vi.runAllTimers();
    expect(root.dataset['nav']).toBeUndefined();
    vi.useRealTimers();
  });
});
