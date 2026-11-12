import { transitionKind } from './view-transitions';

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
